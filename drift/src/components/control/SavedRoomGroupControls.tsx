import { useState } from "react";
import { FolderPen, FolderPlus, Trash2 } from "lucide-react";
import {
  ALL_SAVED_ROOM_GROUP_ID,
  type SavedRoomGroup,
} from "../../types/config";
import { Button, IconButton, Input, Tooltip, TooltipProvider } from "../ui";
import { Toolbar } from "./settings-ui";

type SavedRoomGroupControlsProps = {
  groups: SavedRoomGroup[];
  onCreateGroup: (name: string) => Promise<boolean>;
  onDeleteGroup: (groupId: string) => Promise<boolean>;
  onRenameGroup: (groupId: string, name: string) => Promise<boolean>;
  onSearchQueryChange: (query: string) => void;
  onSelectedGroupChange: (groupId: string) => void;
  searchQuery: string;
  selectedGroupId: string;
};

export function SavedRoomGroupControls({
  groups,
  onCreateGroup,
  onDeleteGroup,
  onRenameGroup,
  onSearchQueryChange,
  onSelectedGroupChange,
  searchQuery,
  selectedGroupId,
}: SavedRoomGroupControlsProps) {
  const [newGroupName, setNewGroupName] = useState("");
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [pendingDeleteGroup, setPendingDeleteGroup] =
    useState<SavedRoomGroup | null>(null);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);

  const selectedGroup =
    selectedGroupId === ALL_SAVED_ROOM_GROUP_ID
      ? null
      : groups.find((group) => group.id === selectedGroupId) ?? null;

  async function createGroup() {
    const created = await onCreateGroup(newGroupName);
    if (created) {
      setNewGroupName("");
      setIsCreatingGroup(false);
    }
  }

  function startCreate() {
    setIsCreatingGroup((current) => !current);
    setRenamingGroupId(null);
    setPendingDeleteGroup(null);
  }

  function startRename(group: SavedRoomGroup) {
    setRenamingGroupId(group.id);
    setRenameDraft(group.name);
    setPendingDeleteGroup(null);
    setIsCreatingGroup(false);
  }

  async function saveRename() {
    if (!renamingGroupId) {
      return;
    }
    const renamed = await onRenameGroup(renamingGroupId, renameDraft);
    if (renamed) {
      setRenamingGroupId(null);
      setRenameDraft("");
    }
  }

  function requestDelete(group: SavedRoomGroup) {
    setRenamingGroupId(null);
    setIsCreatingGroup(false);
    setPendingDeleteGroup(group);
  }

  async function confirmDelete() {
    if (!pendingDeleteGroup) {
      return;
    }
    const deleted = await onDeleteGroup(pendingDeleteGroup.id);
    if (deleted) {
      setPendingDeleteGroup(null);
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="grid min-w-0 gap-2">
        <Toolbar aria-label="常用直播间工具栏">
          <Input
            aria-label="搜索常用直播间"
            inputSize="sm"
            onChange={(event) =>
              onSearchQueryChange(event.currentTarget.value)
            }
            placeholder="搜索房间号、名称、主播"
            type="search"
            value={searchQuery}
          />
          <div className="flex items-center gap-1">
            <Tooltip content="新建分组">
              <IconButton
                active={isCreatingGroup}
                aria-label="新建分组"
                onClick={startCreate}
                size="sm"
              >
                <FolderPlus aria-hidden="true" size={14} />
              </IconButton>
            </Tooltip>
            {selectedGroup ? (
              <>
                <Tooltip content="重命名分组">
                  <IconButton
                    active={renamingGroupId === selectedGroup.id}
                    aria-label="重命名分组"
                    onClick={() => startRename(selectedGroup)}
                    size="sm"
                  >
                    <FolderPen aria-hidden="true" size={14} />
                  </IconButton>
                </Tooltip>
                <Tooltip content="删除分组">
                  <IconButton
                    aria-label="删除分组"
                    disabled={groups.length <= 1}
                    onClick={() => requestDelete(selectedGroup)}
                    size="sm"
                    variant="danger"
                  >
                    <Trash2 aria-hidden="true" size={14} />
                  </IconButton>
                </Tooltip>
              </>
            ) : null}
          </div>
        </Toolbar>

        <div
          aria-label="常用直播间分组"
          className="settings-scroll-list flex min-w-0 gap-1 overflow-x-auto pb-1"
          role="tablist"
        >
          <Button
            active={selectedGroupId === ALL_SAVED_ROOM_GROUP_ID}
            aria-selected={selectedGroupId === ALL_SAVED_ROOM_GROUP_ID}
            onClick={() => onSelectedGroupChange(ALL_SAVED_ROOM_GROUP_ID)}
            role="tab"
            size="sm"
          >
            全部
          </Button>
          {groups.map((group) => (
            <Button
              active={selectedGroupId === group.id}
              aria-selected={selectedGroupId === group.id}
              key={group.id}
              onClick={() => onSelectedGroupChange(group.id)}
              role="tab"
              size="sm"
            >
              {group.name}
            </Button>
          ))}
        </div>

        {isCreatingGroup ||
        (selectedGroup && renamingGroupId === selectedGroup.id) ? (
          <div className="drift-theme-transition grid min-w-0 rounded-lg border border-drift-line bg-[var(--drift-ui-surface)] p-2">
            {isCreatingGroup ? (
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5">
                <Input
                  aria-label="新分组名称"
                  inputSize="sm"
                  onChange={(event) =>
                    setNewGroupName(event.currentTarget.value)
                  }
                  placeholder="新分组"
                  value={newGroupName}
                />
                <Button
                  disabled={!newGroupName.trim()}
                  onClick={createGroup}
                  size="sm"
                  variant="primary"
                >
                  添加
                </Button>
                <Button
                  onClick={() => {
                    setIsCreatingGroup(false);
                    setNewGroupName("");
                  }}
                  size="sm"
                >
                  取消
                </Button>
              </div>
            ) : null}

            {selectedGroup && renamingGroupId === selectedGroup.id ? (
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5">
                <Input
                  aria-label="重命名分组"
                  inputSize="sm"
                  onChange={(event) =>
                    setRenameDraft(event.currentTarget.value)
                  }
                  value={renameDraft}
                />
                <Button
                  disabled={!renameDraft.trim()}
                  onClick={saveRename}
                  size="sm"
                  variant="primary"
                >
                  保存
                </Button>
                <Button
                  onClick={() => {
                    setRenamingGroupId(null);
                    setRenameDraft("");
                  }}
                  size="sm"
                >
                  取消
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {pendingDeleteGroup ? (
          <div
            className="fixed inset-0 z-20 grid place-items-center bg-black/45 p-6"
            role="presentation"
          >
            <div
              aria-labelledby="group-delete-title"
              aria-modal="true"
              className="drift-theme-transition grid w-full max-w-[360px] gap-3 rounded-lg border border-drift-line bg-drift-raised p-4 shadow-2xl"
              role="dialog"
            >
              <strong
                className="drift-theme-transition text-xs text-drift-ink"
                id="group-delete-title"
              >
                删除分组
              </strong>
              <p className="drift-theme-transition m-0 text-[10px] leading-5 text-[var(--drift-ui-muted)]">
                确认删除“{pendingDeleteGroup.name}”？该分组下的常用直播间将变为未分组，只在“全部”中显示。
              </p>
              <div className="flex justify-end gap-1.5">
                <Button onClick={confirmDelete} size="sm" variant="danger">
                  确认删除
                </Button>
                <Button
                  onClick={() => setPendingDeleteGroup(null)}
                  size="sm"
                >
                  取消
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
