import { cn } from "@/src/lib/utils";
import * as React from "react";


const TabsContext = React.createContext<{
  selectedValue: string;
  onValueChange: (value: string) => void;
}>({
  selectedValue: "",
  onValueChange: () => {},
});

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children?: React.ReactNode;
}

const Tabs = ({
  defaultValue,
  value,
  onValueChange,
  className,
  children,
  ...props
}: TabsProps) => {
  const [selectedValue, setSelectedValue] = React.useState<string>(defaultValue || "");

  const handleValueChange = React.useCallback(
    (newValue: string) => {
      setSelectedValue(newValue);
      onValueChange?.(newValue);
    },
    [onValueChange]
  );

  const contextValue = React.useMemo(
    () => ({
      selectedValue: value !== undefined ? value : selectedValue,
      onValueChange: handleValueChange,
    }),
    [value, selectedValue, handleValueChange]
  );

  return (
    <TabsContext.Provider value={contextValue}>
      <div className={cn("w-full", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
};

const TabsList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="tablist"
    className={cn(
      "flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }
>(({ className, value, ...props }, ref) => {
  const { selectedValue, onValueChange } = React.useContext(TabsContext);
  const isSelected = selectedValue === value;

  return (
    <button
      ref={ref}
      role="tab"
      type="button"
      aria-selected={isSelected}
      data-state={isSelected ? "active" : "inactive"}
      onClick={() => onValueChange(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        isSelected
          ? "bg-background text-foreground shadow-sm"
          : "hover:bg-muted/50 hover:text-foreground",
        className
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, value, children, ...props }, ref) => {
  const { selectedValue } = React.useContext(TabsContext);
  const isSelected = selectedValue === value;

  if (!isSelected) return null;

  return (
    <div
      ref={ref}
      role="tabpanel"
      data-state={isSelected ? "active" : "inactive"}
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };