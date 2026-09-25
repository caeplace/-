"use client";

import { useState } from "react";
import type { MemoryType } from "@prisma/client";
import { useRouter } from "next/navigation";
import { Brain, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-provider";
import { getApiErrorMessage, parseApiPayload } from "@/lib/client-api";
import { memoryTypeLabels } from "@/lib/labels";

export type BrandMemoryItem = {
  id: string;
  type: MemoryType;
  title: string;
  content: string;
  source: string | null;
  importance: number;
  priority: number;
  createdAt: string;
  updatedAt: string;
};

type BrandMemoryFormState = {
  memoryType: MemoryType;
  title: string;
  content: string;
  source: string;
  importance: number;
};

type NoticeState = {
  type: "success" | "error";
  message: string;
} | null;

const memoryTypeOptions = [
  "PREFERENCE",
  "BRAND_RULE",
  "PLATFORM_INSIGHT",
  "CONTENT_RULE",
  "COMPLIANCE_RULE",
] as const satisfies readonly MemoryType[];

const emptyForm: BrandMemoryFormState = {
  memoryType: "PREFERENCE",
  title: "",
  content: "",
  source: "手动添加",
  importance: 5,
};

function toFormState(memory: BrandMemoryItem): BrandMemoryFormState {
  return {
    memoryType: memory.type,
    title: memory.title,
    content: memory.content,
    source: memory.source ?? "手动添加",
    importance: memory.importance ?? memory.priority ?? 5,
  };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function MemoryForm({
  values,
  isSaving,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  values: BrandMemoryFormState;
  isSaving: boolean;
  onChange: (values: BrandMemoryFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_120px]">
        <label className="space-y-2 text-sm font-medium">
          记忆类型
          <Select
            value={values.memoryType}
            onValueChange={(memoryType) =>
              onChange({ ...values, memoryType: memoryType as MemoryType })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {memoryTypeOptions.map((item) => (
                <SelectItem key={item} value={item}>
                  {memoryTypeLabels[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="space-y-2 text-sm font-medium">
          来源
          <Input
            value={values.source}
            onChange={(event) =>
              onChange({ ...values, source: event.target.value })
            }
            placeholder="例如：运营复盘、用户反馈"
          />
        </label>

        <label className="space-y-2 text-sm font-medium">
          重要度
          <Input
            type="number"
            min={1}
            max={10}
            value={values.importance}
            onChange={(event) =>
              onChange({
                ...values,
                importance: Number(event.target.value),
              })
            }
          />
        </label>
      </div>

      <label className="space-y-2 text-sm font-medium">
        标题
        <Input
          value={values.title}
          onChange={(event) => onChange({ ...values, title: event.target.value })}
          placeholder="可选，例如：小红书标题偏好"
        />
      </label>

      <label className="space-y-2 text-sm font-medium">
        记忆内容
        <Textarea
          value={values.content}
          onChange={(event) =>
            onChange({ ...values, content: event.target.value })
          }
          placeholder="记录品牌长期偏好、禁用表达、平台经验或内容规则。"
          rows={5}
        />
      </label>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button type="button" disabled={isSaving} onClick={onSubmit}>
          {isSaving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : submitLabel === "保存修改" ? (
            <Save className="size-4" />
          ) : (
            <Plus className="size-4" />
          )}
          {submitLabel}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function BrandMemoryManager({
  initialMemories,
}: {
  initialMemories: BrandMemoryItem[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [memories, setMemories] = useState(initialMemories);
  const [createForm, setCreateForm] = useState<BrandMemoryFormState>(emptyForm);
  const [editForm, setEditForm] = useState<BrandMemoryFormState>(emptyForm);
  const [editingMemory, setEditingMemory] = useState<BrandMemoryItem | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);

  async function createMemory() {
    setNotice(null);
    setSavingId("create");

    try {
      const response = await fetch("/api/brand-memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const payload = await parseApiPayload(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "创建品牌记忆失败。"));
      }

      setMemories((current) => [payload.memory, ...current]);
      setCreateForm(emptyForm);
      setCreateOpen(false);
      setNotice({ type: "success", message: "品牌记忆已创建。" });
      showToast({ type: "success", title: "品牌记忆已创建" });
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "创建品牌记忆失败。";
      setNotice({ type: "error", message });
      showToast({ type: "error", title: "创建失败", description: message });
    } finally {
      setSavingId(null);
    }
  }

  async function updateMemory() {
    if (!editingMemory) return;

    setNotice(null);
    setSavingId(editingMemory.id);

    try {
      const response = await fetch(`/api/brand-memories/${editingMemory.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const payload = await parseApiPayload(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "更新品牌记忆失败。"));
      }

      setMemories((current) =>
        current.map((memory) =>
          memory.id === editingMemory.id ? payload.memory : memory,
        ),
      );
      setEditingMemory(null);
      setNotice({ type: "success", message: "品牌记忆已更新。" });
      showToast({ type: "success", title: "品牌记忆已更新" });
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "更新品牌记忆失败。";
      setNotice({ type: "error", message });
      showToast({ type: "error", title: "更新失败", description: message });
    } finally {
      setSavingId(null);
    }
  }

  async function deleteMemory(memoryId: string) {
    const confirmed = window.confirm("确定删除这条品牌记忆吗？");
    if (!confirmed) return;

    setNotice(null);
    setSavingId(memoryId);

    try {
      const response = await fetch(`/api/brand-memories/${memoryId}`, {
        method: "DELETE",
      });
      const payload = await parseApiPayload(response);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "删除品牌记忆失败。"));
      }

      setMemories((current) =>
        current.filter((memory) => memory.id !== memoryId),
      );
      setNotice({ type: "success", message: "品牌记忆已删除。" });
      showToast({ type: "success", title: "品牌记忆已删除" });
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除品牌记忆失败。";
      setNotice({ type: "error", message });
      showToast({ type: "error", title: "删除失败", description: message });
    } finally {
      setSavingId(null);
    }
  }

  function startEdit(memory: BrandMemoryItem) {
    setEditingMemory(memory);
    setEditForm(toFormState(memory));
    setNotice(null);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="size-4 text-primary" />
                品牌记忆
              </CardTitle>
              <CardDescription>
                记录长期偏好、品牌规则、平台经验、内容规则和合规规则。
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{memories.length} 条记忆</Badge>
              <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                新增记忆
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {notice ? (
            <div
              className={`rounded-md border px-3 py-2 text-sm ${
                notice.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {notice.message}
            </div>
          ) : null}

          {memories.length > 0 ? (
            <div className="divide-y rounded-md border">
              {memories.map((memory) => (
                <div
                  key={memory.id}
                  className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{memoryTypeLabels[memory.type]}</Badge>
                      <Badge variant="outline">
                        重要度 {memory.importance ?? memory.priority}
                      </Badge>
                      <Badge variant="secondary">
                        {memory.source ?? "手动添加"}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm font-medium">
                      {memory.title || "未命名记忆"}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                      {memory.content}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      更新于 {formatDateTime(memory.updatedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => startEdit(memory)}
                    >
                      <Pencil className="size-4" />
                      编辑
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={savingId === memory.id}
                      onClick={() => deleteMemory(memory.id)}
                    >
                      {savingId === memory.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                      删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-8 text-center">
              <p className="text-sm font-medium">暂无品牌记忆</p>
              <p className="mt-2 text-sm text-muted-foreground">
                可以先记录一条语气偏好、禁用表达或平台经验。
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>新增品牌记忆</DialogTitle>
            <DialogDescription>
              品牌记忆会影响后续生成内容的语气、规则和运营建议。
            </DialogDescription>
          </DialogHeader>
          <MemoryForm
            values={createForm}
            submitLabel="新增记忆"
            isSaving={savingId === "create"}
            onChange={setCreateForm}
            onSubmit={createMemory}
            onCancel={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingMemory)}
        onOpenChange={(open) => {
          if (!open) setEditingMemory(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>编辑品牌记忆</DialogTitle>
            <DialogDescription>
              调整后会立即影响后续 AI 生成上下文。
            </DialogDescription>
          </DialogHeader>
          <MemoryForm
            values={editForm}
            submitLabel="保存修改"
            isSaving={Boolean(editingMemory && savingId === editingMemory.id)}
            onChange={setEditForm}
            onSubmit={updateMemory}
            onCancel={() => setEditingMemory(null)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
