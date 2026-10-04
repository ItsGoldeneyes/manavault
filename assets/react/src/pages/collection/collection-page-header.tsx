import {
  Boxes,
  BrushCleaning,
  ChevronDown,
  DatabaseArrowDown,
  FileInput,
  HandCoins,
  ListChecks,
  Plus,
  WandSparkles,
} from "lucide-react"
import { PageHeader } from "../../components/app-shell"
import { Button } from "../../components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs"
import type { CollectionTab } from "./types"

type CollectionPageHeaderProps = {
  activeTab: CollectionTab
  itemCounts: {
    all: number
    recent: number
    available: number
    unfiled: number
  }
  locationCount: number
  onAddItem: () => void
  quickCheckOpen?: boolean
  autoSortDisabled?: boolean
  autoSortPending?: boolean
  onAddLocation: () => void
  onImport: () => void
  onExportCsv: () => void
  onSellCards: () => void
  onBulkClean: () => void
  onQuickCheck: () => void
  onAutoSort: () => void
  onSelectTab: (tab: CollectionTab) => void
}

export function CollectionPageHeader({
  activeTab,
  autoSortDisabled = false,
  autoSortPending = false,
  itemCounts,
  locationCount,
  quickCheckOpen = false,
  onAddItem,
  onAddLocation,
  onAutoSort,
  onImport,
  onQuickCheck,
  onExportCsv,
  onSellCards,
  onBulkClean,
  onSelectTab,
}: CollectionPageHeaderProps) {
  return (
    <>
      <PageHeader
        title="Collection"
        eyebrow="ManaVault Inventory"
        description="Your boxes, binders, lists, and owned printings."
        bottomActions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button">
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
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
            <Button
              type="button"
              variant={quickCheckOpen ? "secondary" : "outline"}
              aria-expanded={quickCheckOpen}
              aria-controls="collection-quick-check"
              onClick={onQuickCheck}
            >
              <ListChecks className="h-4 w-4" />
              Check a list
            </Button>
            <Button type="button" variant="outline" onClick={onImport}>
              <DatabaseArrowDown className="h-4 w-4" />
              Import
            </Button>
            <Button type="button" variant="outline" onClick={onExportCsv}>
              <FileInput className="h-4 w-4" />
              Export
            </Button>
            <Button type="button" variant="outline" onClick={onSellCards}>
              <HandCoins className="h-4 w-4" />
              Sell
            </Button>
            <Button type="button" variant="outline" onClick={onBulkClean}>
              <BrushCleaning className="h-4 w-4" />
              Bulk clean
            </Button>
            <Button
              type="button"
              variant="outline"
              title="Preview auto-sort"
              disabled={autoSortDisabled || autoSortPending}
              onClick={onAutoSort}
            >
              <WandSparkles className="h-4 w-4" />
              {autoSortPending ? "Previewing..." : "Auto-sort"}
            </Button>
          </div>
        }
      />

      <CollectionTabs
        activeTab={activeTab}
        itemCounts={itemCounts}
        locationCount={locationCount}
        onSelectTab={onSelectTab}
      />
    </>
  )
}

function CollectionTabs({
  activeTab,
  itemCounts,
  locationCount,
  onSelectTab,
}: Pick<CollectionPageHeaderProps, "activeTab" | "itemCounts" | "locationCount" | "onSelectTab">) {
  const tabs: { tab: CollectionTab; label: string; count?: number }[] = [
    { tab: "locations", label: "Locations", count: locationCount },
    { tab: "all", label: "All cards", count: itemCounts.all },
    { tab: "recent", label: "Recently added", count: itemCounts.recent },
    { tab: "available", label: "Available to pull", count: itemCounts.available },
    { tab: "unfiled", label: "Unfiled", count: itemCounts.unfiled },
    { tab: "value", label: "Value" },
  ]
  const active = tabs.find(({ tab }) => tab === activeTab) ?? tabs[0]

  return (
    <>
      <div className="mb-7 sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-between"
              aria-label="Collection view"
            >
              <span className="flex items-center gap-2">
                <span>{active.label}</span>
                {active.count !== undefined ? (
                  <span className="badge badge-primary badge-sm">{active.count}</span>
                ) : null}
              </span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
            {tabs.map(({ tab, label, count }) => (
              <DropdownMenuItem key={tab} onSelect={() => onSelectTab(tab)}>
                <span className="flex-1">{label}</span>
                {count !== undefined ? (
                  <span
                    className={
                      tab === activeTab
                        ? "badge badge-primary badge-sm"
                        : "badge badge-ghost badge-sm"
                    }
                  >
                    {count}
                  </span>
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(tab) => onSelectTab(tab as CollectionTab)}
        className="hidden sm:block"
      >
        <TabsList aria-label="Collection view">
          {tabs.map(({ tab, label, count }) => (
            <TabsTrigger
              key={tab}
              value={tab}
              id={`collection-tab-${tab}`}
              aria-controls="collection-view-panel"
            >
              <span>{label}</span>
              {count !== undefined ? (
                <span
                  className={
                    tab === activeTab
                      ? "badge badge-primary badge-sm"
                      : "badge badge-ghost badge-sm"
                  }
                >
                  {count}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </>
  )
}
