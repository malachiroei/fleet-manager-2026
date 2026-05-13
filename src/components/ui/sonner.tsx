import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      dir="rtl"
      position="top-center"
      expand
      richColors
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:text-right",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:!text-sm group-[.toast]:!leading-relaxed group-[.toast]:!whitespace-pre-wrap",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          error:
            "group-[.toaster]:!bg-red-950 group-[.toaster]:!border-red-700 group-[.toaster]:!text-red-100",
        },
        duration: 8000,
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
