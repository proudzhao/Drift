use std::collections::{HashSet, VecDeque};

use super::types::{LiveMessage, LiveMessageKind};

const SUPER_CHAT_DEDUP_CAPACITY: usize = 2048;

pub(crate) struct SuperChatDedupWindow {
    capacity: usize,
    order: VecDeque<String>,
    seen: HashSet<String>,
}

impl Default for SuperChatDedupWindow {
    fn default() -> Self {
        Self::with_capacity(SUPER_CHAT_DEDUP_CAPACITY)
    }
}

impl SuperChatDedupWindow {
    fn with_capacity(capacity: usize) -> Self {
        assert!(capacity > 0, "SC dedup capacity must be positive");
        Self {
            capacity,
            order: VecDeque::with_capacity(capacity),
            seen: HashSet::with_capacity(capacity),
        }
    }

    pub(crate) fn retain_new(
        &mut self,
        room_id: u64,
        messages: Vec<LiveMessage>,
    ) -> Vec<LiveMessage> {
        messages
            .into_iter()
            .filter(|message| self.accept(room_id, message))
            .collect()
    }

    fn accept(&mut self, room_id: u64, message: &LiveMessage) -> bool {
        if !matches!(&message.kind, LiveMessageKind::SuperChat) {
            return true;
        }

        let Some(source_id) = message.source_message_id.as_deref() else {
            return true;
        };

        if self.seen.contains(source_id) {
            tracing::info!(
                target: "drift::bilibili.sc_dedup",
                room_id,
                sc_id = source_id,
                source_command = message.source_command.as_deref().unwrap_or("unknown"),
                duplicate = true,
                "dropping duplicate super chat event"
            );
            return false;
        }

        let owned_id = source_id.to_string();
        self.seen.insert(owned_id.clone());
        self.order.push_back(owned_id);
        if self.order.len() > self.capacity {
            if let Some(evicted) = self.order.pop_front() {
                self.seen.remove(&evicted);
            }
        }
        true
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        self.seen.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bilibili::types::LiveMessage;

    fn super_chat(source_id: Option<&str>, command: &str, text: &str) -> LiveMessage {
        LiveMessage {
            id: source_id
                .map(|id| format!("sc-{}", id))
                .unwrap_or_else(|| "sc-fallback".to_string()),
            room_id: Some(6),
            sender_uid: None,
            current_room_fan_medal: None,
            current_room_fan_medal_level: None,
            kind: LiveMessageKind::SuperChat,
            user: "用户".to_string(),
            text: text.to_string(),
            segments: None,
            is_self: false,
            timestamp: Some(100),
            gift_name: None,
            gift_count: None,
            guard_level: None,
            guard_name: None,
            super_chat_price: Some(30),
            super_chat_duration: Some(60),
            super_chat_color: None,
            source_command: Some(command.to_string()),
            source_message_id: source_id.map(str::to_string),
        }
    }

    #[test]
    fn drops_same_id_across_regular_and_jpn_commands() {
        let mut window = SuperChatDedupWindow::default();
        let accepted = window.retain_new(
            6,
            vec![
                super_chat(Some("10"), "SUPER_CHAT_MESSAGE", "同一正文"),
                super_chat(Some("10"), "SUPER_CHAT_MESSAGE_JPN", "同一正文"),
            ],
        );
        assert_eq!(accepted.len(), 1);
        assert_eq!(
            accepted[0].source_command.as_deref(),
            Some("SUPER_CHAT_MESSAGE")
        );
    }

    #[test]
    fn keeps_different_ids_even_with_same_text() {
        let mut window = SuperChatDedupWindow::default();
        let accepted = window.retain_new(
            6,
            vec![
                super_chat(Some("10"), "SUPER_CHAT_MESSAGE", "相同正文"),
                super_chat(Some("11"), "SUPER_CHAT_MESSAGE", "相同正文"),
            ],
        );
        assert_eq!(accepted.len(), 2);
    }

    #[test]
    fn fallback_messages_are_never_deduplicated() {
        let mut window = SuperChatDedupWindow::default();
        let accepted = window.retain_new(
            6,
            vec![
                super_chat(None, "SUPER_CHAT_MESSAGE", "fallback"),
                super_chat(None, "SUPER_CHAT_MESSAGE", "fallback"),
            ],
        );
        assert_eq!(accepted.len(), 2);
        assert_eq!(window.len(), 0);
    }

    #[test]
    fn non_super_chat_messages_never_enter_the_window() {
        let mut message = super_chat(Some("10"), "DANMU_MSG", "普通弹幕");
        message.kind = LiveMessageKind::Danmaku;
        let mut window = SuperChatDedupWindow::default();

        let accepted = window.retain_new(6, vec![message.clone(), message]);

        assert_eq!(accepted.len(), 2);
        assert_eq!(window.len(), 0);
    }

    #[test]
    fn default_window_keeps_exactly_2048_ids() {
        let mut window = SuperChatDedupWindow::default();
        for id in 0..SUPER_CHAT_DEDUP_CAPACITY {
            let source_id = id.to_string();
            assert_eq!(
                window
                    .retain_new(
                        6,
                        vec![super_chat(Some(&source_id), "SUPER_CHAT_MESSAGE", "正文",)],
                    )
                    .len(),
                1
            );
        }
        assert_eq!(window.len(), SUPER_CHAT_DEDUP_CAPACITY);

        assert_eq!(
            window
                .retain_new(
                    6,
                    vec![super_chat(Some("2048"), "SUPER_CHAT_MESSAGE", "正文")],
                )
                .len(),
            1
        );
        assert_eq!(window.len(), SUPER_CHAT_DEDUP_CAPACITY);
        assert_eq!(
            window
                .retain_new(6, vec![super_chat(Some("0"), "SUPER_CHAT_MESSAGE", "正文")],)
                .len(),
            1
        );
    }

    #[test]
    fn evicts_oldest_without_refreshing_duplicate_order() {
        let mut window = SuperChatDedupWindow::with_capacity(2);
        assert_eq!(
            window
                .retain_new(6, vec![super_chat(Some("1"), "SUPER_CHAT_MESSAGE", "1")],)
                .len(),
            1
        );
        assert_eq!(
            window
                .retain_new(6, vec![super_chat(Some("2"), "SUPER_CHAT_MESSAGE", "2")],)
                .len(),
            1
        );
        assert!(window
            .retain_new(
                6,
                vec![super_chat(Some("1"), "SUPER_CHAT_MESSAGE_JPN", "1")],
            )
            .is_empty());
        assert_eq!(
            window
                .retain_new(6, vec![super_chat(Some("3"), "SUPER_CHAT_MESSAGE", "3")],)
                .len(),
            1
        );
        assert_eq!(
            window
                .retain_new(6, vec![super_chat(Some("1"), "SUPER_CHAT_MESSAGE", "1")],)
                .len(),
            1
        );
    }

    #[test]
    fn separate_windows_do_not_share_ids() {
        let message = super_chat(Some("10"), "SUPER_CHAT_MESSAGE", "正文");
        let mut first = SuperChatDedupWindow::default();
        let mut second = SuperChatDedupWindow::default();
        assert_eq!(first.retain_new(6, vec![message.clone()]).len(), 1);
        assert!(first.retain_new(6, vec![message.clone()]).is_empty());
        assert_eq!(second.retain_new(6, vec![message]).len(), 1);
    }

    #[test]
    fn one_window_rejects_an_id_across_multiple_connection_batches() {
        let mut window = SuperChatDedupWindow::default();
        assert_eq!(
            window
                .retain_new(
                    6,
                    vec![super_chat(Some("10"), "SUPER_CHAT_MESSAGE", "第一次连接",)],
                )
                .len(),
            1
        );
        assert!(window
            .retain_new(
                6,
                vec![super_chat(Some("10"), "SUPER_CHAT_MESSAGE_JPN", "重连重放",)],
            )
            .is_empty());
    }
}
