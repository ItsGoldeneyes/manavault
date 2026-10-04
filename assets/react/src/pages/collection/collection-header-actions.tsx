import {
  Boxes,
  BrushCleaning,
  DatabaseArrowDown,
  FileInput,
  HandCoins,
  ListChecks,
  type LucideIcon,
  Plus,
  WandSparkles,
} from "lucide-react"
import { type ComponentProps, type FocusEvent, useState } from "react"
import { Button } from "../../components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import { cn } from "../../lib/utils"

type HeaderAction = "add" | "check" | "import" | "export" | "sell" | "clean" | "autoSort"

type CollectionHeaderActionsProps = {
  quickCheckOpen: boolean
  autoSortDisabled: boolean
  autoSortPending: boolean
  onAddItem: () => void
  onAddLocation: () => void
  onQuickCheck: () => void
  onImport: () => void
  onExportCsv: () => void
  onSellCards: () => void
  onBulkClean: () => void
  onAutoSort: () => void
}

// Icon buttons that reveal one label at a time: Add rests expanded, and
// hovering or keyboard-focusing another action slides its label in instead.
export function CollectionHeaderActions({
  quickCheckOpen,
  autoSortDisabled,
  autoSortPending,
  onAddItem,
  onAddLocation,
  onQuickCheck,
  onImport,
  onExportCsv,
  onSellCards,
  onBulkClean,
  onAutoSort,
}: CollectionHeaderActionsProps) {
  const [hovered, setHovered] = useState<HeaderAction | null>(null)
  const expanded = hovered ?? (autoSortPending ? "autoSort" : "add")
  const actionProps = (action: HeaderAction) => ({
    expanded: expanded === action,
    onPointerEnter: (event: { pointerType: string }) => {
      if (event.pointerType === "mouse") setHovered(action)
    },
    onFocus: (event: FocusEvent<HTMLButtonElement>) => {
      if (event.currentTarget.matches(":focus-visible")) setHovered(action)
    },
  })

  return (
    <div
      className="grid w-full grid-cols-7 gap-1 sm:flex sm:items-center sm:justify-end sm:gap-2"
      onPointerLeave={() => setHovered(null)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovered(null)
      }}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ActionButton icon={Plus} label="Add" variant="default" {...actionProps("add")} />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onAddItem}>
            <Plus className="h-4 w-4" />
            Add card
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onAddLocation}>
            <Boxes className="h-4 w-4" />
            Add location
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ActionButton
        icon={ListChecks}
        label="Check a list"
        caption="Check"
        variant={quickCheckOpen ? "secondary" : "outline"}
        aria-expanded={quickCheckOpen}
        aria-controls="collection-quick-check"
        onClick={onQuickCheck}
        {...actionProps("check")}
      />
      <ActionButton
        icon={DatabaseArrowDown}
        label="Import"
        onClick={onImport}
        {...actionProps("import")}
      />
      <ActionButton
        icon={FileInput}
        label="Export"
        onClick={onExportCsv}
        {...actionProps("export")}
      />
      <ActionButton icon={HandCoins} label="Sell" onClick={onSellCards} {...actionProps("sell")} />
      <ActionButton
        icon={BrushCleaning}
        label="Bulk clean"
        caption="Clean"
        onClick={onBulkClean}
        {...actionProps("clean")}
      />
      <ActionButton
        icon={WandSparkles}
        label={autoSortPending ? "Previewing..." : "Auto-sort"}
        caption="Sort"
        className="disabled:pointer-events-auto disabled:cursor-not-allowed"
        disabled={autoSortDisabled || autoSortPending}
        onClick={onAutoSort}
        {...actionProps("autoSort")}
      />
    </div>
  )
}

type ActionButtonProps = Omit<ComponentProps<typeof Button>, "children"> & {
  icon: LucideIcon
  label: string
  // Shown under the icon on small screens, where there is no hover to reveal labels.
  caption?: string
  expanded: boolean
}

function ActionButton({
  icon: Icon,
  label,
  caption = label,
  expanded,
  className,
  variant = "outline",
  ...props
}: ActionButtonProps) {
  return (
    <Button
      type="button"
      variant={variant}
      aria-label={label}
      title={expanded ? undefined : label}
      className={cn(
        "gap-0 px-0 max-sm:h-auto max-sm:min-h-0 max-sm:flex-col max-sm:rounded-xl max-sm:py-1.5",
        className,
      )}
      {...props}
    >
      <span className="grid size-[calc(var(--size)-2px)] shrink-0 place-items-center">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-[10px] leading-tight font-semibold tracking-tight sm:hidden">
        {caption}
      </span>
      <span
        className={cn(
          "grid max-sm:hidden transition-[grid-template-columns,padding,opacity] duration-200 ease-out motion-reduce:transition-none",
          expanded ? "grid-cols-[1fr] pr-3.5 opacity-100" : "grid-cols-[0fr] pr-0 opacity-0",
        )}
      >
        <span className="min-w-0 overflow-hidden whitespace-nowrap">{label}</span>
      </span>
    </Button>
  )
}
