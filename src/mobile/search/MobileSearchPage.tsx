import { useRef } from "react";
import { Search3Line, CloseCircleFill } from "@mingcute/react";
import SearchResultsList from "@/features/search/ui/SearchResultsList";
import { SearchHistoryList } from "@/features/search";
import { SEARCH_FILTER_ICONS, SEARCH_FILTER_KEYS, useSearchController } from "@/features/search/hooks/useSearchController";
import { useTranslation } from "@/languages";

const font = { fontFamily: "var(--font-inter), sans-serif" } as const;

export default function MobileSearchPage() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const {
    searchQuery,
    setSearchQuery,
    hasSearchQuery,
    activeFilter,
    setActiveFilter,
    filterLabels,
    isArtistSearchFilter,
    isPlaylistSearchFilter,
    historyItems,
    searchResults,
    searchLoading,
    isSearchEmpty,
    partialWarning,
    runSearchNow,
    handlePlayFromSearch,
    handleNavigateItem,
    submitSearchQuery,
    selectHistoryQuery,
  } = useSearchController({ enabled: true, onNavigate: () => inputRef.current?.blur() });

  return (
    <div className="flex h-full w-full flex-col">
      <div className="shrink-0 px-[16px] pt-[12px] pb-[8px]">
        <h1 className="m-0 pb-[12px] text-[28px] font-[700] tracking-[-0.03em] text-text-primary" style={font}>
          {t("common.search")}
        </h1>
        <form
          className="soniq-mobile-surface flex h-[44px] items-center gap-[10px] rounded-[12px] bg-border-alpha-14 px-[12px]"
          onSubmit={(e) => {
            e.preventDefault();
            submitSearchQuery(searchQuery);
            runSearchNow();
            inputRef.current?.blur();
          }}
        >
          {searchLoading ? (
            <span className="inline-block h-[17px] w-[17px] shrink-0 animate-spin rounded-full border-[1.5px] border-text-secondary border-t-transparent" />
          ) : (
            <Search3Line size={19} className="shrink-0 text-text-tertiary" />
          )}
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={t("common.search")}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            // 16px keeps iOS from zooming into the field
            className="min-w-0 flex-1 border-none bg-transparent text-[16px] text-text-primary outline-none placeholder:text-text-tertiary [&::-webkit-search-cancel-button]:hidden"
            style={font}
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setSearchQuery("");
                inputRef.current?.focus();
              }}
              className="-mr-[8px] inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center border-none bg-transparent text-text-tertiary cursor-pointer"
            >
              <CloseCircleFill size={18} />
            </button>
          )}
        </form>

        {hasSearchQuery && (
          <div className="-mx-[16px] mt-[10px] flex gap-[8px] overflow-x-auto px-[16px]">
            {SEARCH_FILTER_KEYS.map((key) => {
              const Icon = SEARCH_FILTER_ICONS[key];
              const isActive = activeFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  data-active={isActive ? "true" : undefined}
                  onClick={() => setActiveFilter(key)}
                  className={`soniq-mobile-filter flex h-[34px] shrink-0 items-center gap-[6px] rounded-full border-none px-[14px] text-[14px] cursor-pointer select-none transition-colors ${
                    isActive ? "bg-text-primary text-bg-primary font-[600]" : "bg-border-alpha-14 text-text-secondary"
                  }`}
                  style={font}
                >
                  <Icon size={15} />
                  {filterLabels[key]}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {hasSearchQuery ? (
          isSearchEmpty ? (
            <div className="flex h-full flex-col items-center justify-center gap-[6px] px-[24px] text-center" style={font}>
              <p className="m-0 text-[16px] font-[600] text-text-primary">{t("common.no_results")}</p>
              <p className="m-0 text-[14px] text-text-tertiary">{t("common.try_another_search")}</p>
            </div>
          ) : searchResults.length > 0 ? (
            <SearchResultsList
              key={activeFilter}
              items={searchResults}
              isArtistSearchFilter={isArtistSearchFilter}
              isPlaylistSearchFilter={isPlaylistSearchFilter}
              onPlayFromSearch={handlePlayFromSearch}
              onNavigateItem={handleNavigateItem}
              scrollRef={listRef}
              partialWarning={partialWarning}
            />
          ) : null
        ) : historyItems.length > 0 ? (
          <SearchHistoryList
            onSelectQuery={selectHistoryQuery}
            onPlayTrack={handlePlayFromSearch}
            onNavigateItem={handleNavigateItem}
            scrollRef={listRef}
          />
        ) : null}
      </div>
    </div>
  );
}
