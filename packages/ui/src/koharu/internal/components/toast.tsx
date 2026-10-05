// The editor mounts the @aphrody/m3-primitives Toaster (providers.tsx), and the shared
// @shenron/ui kit has no toast manager. This keeps the `toast.add` contract the editor store
// uses and hands every notice to that mounted toaster.
import { toast as hostToast } from "@aphrody/m3-primitives";

type ToastType = "info" | "success" | "warning" | "error";

interface ToastNotice {
  type?: ToastType;
  title: string;
  description?: string;
}

const toast = {
  add({ type = "info", title, description }: ToastNotice) {
    return hostToast[type]({ title, body: description });
  },
};

export { toast };
