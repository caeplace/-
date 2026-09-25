"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Upload } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-provider";
import { getApiErrorMessage, parseApiPayload } from "@/lib/client-api";

type NoticeState = {
  type: "success" | "error";
  message: string;
} | null;

type AssetUploadDialogProps = {
  trigger?: ReactNode;
  triggerLabel?: string;
  triggerVariant?: ButtonProps["variant"];
  triggerClassName?: string;
};

const acceptedFileTypes = [
  "image/*",
  "video/*",
  "application/pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".txt",
  ".md",
  ".csv",
  ".tsv",
].join(",");

export function AssetUploadDialog({
  trigger,
  triggerLabel = "上传素材",
  triggerVariant = "default",
  triggerClassName,
}: AssetUploadDialogProps = {}) {
  const router = useRouter();
  const { showToast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  const [notice, setNotice] = useState<NoticeState>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setIsUploading(true);

    try {
      const response = await fetch("/api/assets/upload", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const payload = await parseApiPayload(response);

      if (!response.ok) {
        const message = getApiErrorMessage(payload, "上传失败，请稍后再试。");
        setNotice({ type: "error", message });
        showToast({ type: "error", title: "上传失败", description: message });
        return;
      }

      formRef.current?.reset();
      setSelectedCount(0);
      const message =
        typeof payload.message === "string" ? payload.message : "素材批次已创建。";
      setNotice({ type: "success", message });
      showToast({ type: "success", title: "上传成功", description: message });
      router.refresh();
      setOpen(false);
    } catch {
      const message = "网络暂时不可用，素材上传失败。";
      setNotice({ type: "error", message });
      showToast({ type: "error", title: "上传失败", description: message });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant={triggerVariant} className={triggerClassName}>
            <Upload className="size-4" />
            {triggerLabel}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form ref={formRef} className="space-y-5" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>创建素材批次</DialogTitle>
            <DialogDescription>
              批次会写入 AssetBatch，上传的每个文件会保存为 Asset。
            </DialogDescription>
          </DialogHeader>

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

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              批次名称
              <Input
                name="name"
                placeholder="例如：夏季通勤主题素材"
                required
              />
            </label>

            <label className="space-y-2 text-sm font-medium">
              默认标签
              <Input name="tags" placeholder="产品图，通勤，夏季" />
            </label>
          </div>

          <label className="space-y-2 text-sm font-medium">
            批次说明
            <Textarea
              name="description"
              placeholder="描述这批素材的来源、主题或拍摄场景。"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              产品名称
              <Input name="productName" placeholder="例如：低糖冷萃茶" />
            </label>

            <label className="space-y-2 text-sm font-medium">
              场景
              <Input name="scene" placeholder="例如：办公室、通勤、开箱" />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              建议用途
              <Input name="suggestedUse" placeholder="例如：小红书封面、短视频素材" />
            </label>

            <label className="space-y-2 text-sm font-medium">
              推荐平台
              <Input name="recommendedPlatforms" placeholder="小红书，Instagram，TikTok" />
            </label>
          </div>

          <label className="block space-y-2 text-sm font-medium">
            素材文件
            <div className="flex min-h-36 flex-col items-center justify-center rounded-md border border-dashed bg-muted/40 px-4 py-8 text-center">
              <FileUp className="mb-3 size-8 text-muted-foreground" />
              <p className="text-sm font-medium">
                {selectedCount > 0
                  ? `已选择 ${selectedCount} 个文件`
                  : "选择图片、视频、PDF、文档或文本资料"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                支持多选，当前使用本地 mock storage。
              </p>
              <Input
                className="mt-4 max-w-sm bg-background"
                name="files"
                type="file"
                accept={acceptedFileTypes}
                multiple
                required
                onChange={(event) =>
                  setSelectedCount(event.currentTarget.files?.length ?? 0)
                }
              />
            </div>
          </label>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isUploading}>
                取消
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isUploading}>
              {isUploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              创建并上传
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
