import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Search3Line, CloseCircleFill } from "@mingcute/react";
import Sidebar from "./Sidebar";
import WindowControls from "./WindowControls";
import PageTransition from "./PageTransition";
import RightDrawer from "./RightDrawer";
import { ShellBackground, useShellBackground } from "./ShellBackground";
import { useGlobalShortcuts } from "../hooks/useGlobalShortcuts";
import { useDisableButtonFocus } from "../hooks/useDisableButtonFocus";
import {
  SEARCH_FILTER_ICONS,
  SEARCH_FILTER_KEYS,
  useSearchController,
} from "@/features/search/hooks/useSearchController";
import {
  FullscreenPlayer,
  playerEngine,
  MiniPlayer,
  usePlayerStore,
} from "@/features/player";
import SearchResultsList from "@/features/search/ui/SearchResultsList";
import { SearchHistoryList } from "@/features/search";
import { useTranslation } from "@/languages";
import {
  AddToPlaylistModal,
  AddToLibraryModal,
  RemoveFromPlaylistModal,
  RemoveFromLibraryModal,
  ImportLikesModal,
  ImportReviewModal,
  CreatePlaylistModal,
  useModalStore,
} from "@/features/library";
import { SettingsModal } from "@/features/settings";
import { UpdateModal, UpdateToastBridge } from "@/features/updater";


interface AppFrameProps {
  children: React.ReactNode;
}

const RIGHT_DRAWER_WIDTH = 440;
const SIDEBAR_WIDTH = 58;
const SHELL_EDGE_GAP = 12;
const SEARCH_QUERY_CACHE_TTL_MS = 60_000;
const LEGACY_LAYOUT_STORAGE_KEYS = [
  "liner_right_sidebar",
  "liner_sidebar_position",
  "liner_sidebar_width",
  "liner_queue_popup_open",
] as const;

export default function AppFrame({ children }: AppFrameProps) {
  const location = useLocation();
  const { pathname, search } = location;
  const navigate = useNavigate();
  const { t } = useTranslation();

  const searchOpen = useModalStore((state) => state.searchOpen);
  const openSearch = useModalStore((state) => state.openSearch);
  const closeSearch = useModalStore((state) => state.closeSearch);
  const toggleSearch = useModalStore((state) => state.toggleSearch);
  const openSettings = useModalStore((state) => state.openSettings);

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
  } = useSearchController({ enabled: searchOpen, onNavigate: closeSearch });
  const [queuePopupOpen, setQueuePopupOpen] = useState(false);
  const [rightDrawerTab, setRightDrawerTabState] = useState<"queue" | "lyrics">(() => {
    if (typeof window === "undefined") return "queue";
    const saved = window.localStorage.getItem("liner_right_drawer_tab");
    return saved === "queue" || saved === "lyrics" ? saved : "queue";
  });
  const fullscreenPlayerOpen = usePlayerStore((state) => state.fullscreen);
  const setFullscreenPlayerOpen = usePlayerStore((state) => state.setFullscreen);
  const [fullscreenEffectsReady, setFullscreenEffectsReady] = useState(false);

  useEffect(() => {
    if (pathname === "/settings") {
      openSettings();
      navigate("/", { replace: true });
    }
  }, [pathname, openSettings, navigate]);

  useEffect(() => {
    for (const key of LEGACY_LAYOUT_STORAGE_KEYS) {
      localStorage.removeItem(key);
    }
  }, []);

  const handleQueuePopupToggle = useCallback((open: boolean) => {
    setQueuePopupOpen(open);
  }, []);

  const handleQueuePopupToggleRequest = useCallback(() => {
    setQueuePopupOpen((current) => !current);
  }, []);

  const shouldShowMiniPlayer = useSyncExternalStore(
    playerEngine.subscribe,
    () => {
      const state = playerEngine.getSnapshot();
      return state.currentTrack !== null && state.status !== "idle";
    },
    () => false,
  );

  const hasCurrentTrack = useSyncExternalStore(
    playerEngine.subscribe,
    () => playerEngine.getSnapshot().currentTrack !== null,
    () => false,
  );

  const appFrameRef = useRef<HTMLDivElement>(null);
  const queueDrawerRef = useRef<HTMLDivElement>(null);
  const searchPopupRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const prevLocationRef = useRef(pathname + search);

  useEffect(() => {
    if (prevLocationRef.current !== pathname + search) {
      prevLocationRef.current = pathname + search;
      if (searchOpen && searchQuery.trim().length === 0) {
        closeSearch();
      }
    }
  }, [pathname, search, searchOpen, searchQuery, closeSearch]);

  useLayoutEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTop = 0;
      const innerScrollables = mainScrollRef.current.querySelectorAll(".overflow-y-auto");
      innerScrollables.forEach((el) => {
        el.scrollTop = 0;
      });
    }
  }, [pathname, search]);

  const updateSearchMask = useCallback(() => {
    const el = searchScrollRef.current;
    if (!el) return;
    const { scrollTop, clientHeight, scrollHeight } = el;
    const showTop = scrollTop > 1;
    const showBottom = scrollTop + clientHeight < scrollHeight - 1;

    let stops = "";
    if (showTop) stops += "transparent 0%, black 7%, ";
    else stops += "black 0%, black 7%, ";
    if (showBottom) stops += "black 93%, transparent 100%";
    else stops += "black 93%, black 100%";

    setSearchScrollMask(`linear-gradient(to bottom, ${stops})`);
  }, []);

  useEffect(() => {
    if (!searchOpen) {
      const timeoutId = setTimeout(() => {
        setSearchQuery("");
      }, SEARCH_QUERY_CACHE_TTL_MS);
      return () => clearTimeout(timeoutId);
    }
    const id = requestAnimationFrame(updateSearchMask);
    requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [searchOpen, updateSearchMask]);

  const miniPlayerContainerRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const searchScrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isFullscreenRoute = pathname === "/player";
  const isFullscreenPlayer = isFullscreenRoute || fullscreenPlayerOpen;
  const shellChildrenRef = useRef<React.ReactNode>(null);
  if (!isFullscreenRoute) {
    shellChildrenRef.current = children;
  }
  const isRightDrawerOpen =
    queuePopupOpen && !searchOpen && !isFullscreenPlayer;

  const openFullscreenPlayer = useCallback(() => {
    setFullscreenPlayerOpen(true);
  }, []);

  const closeFullscreenPlayer = useCallback(() => {
    setFullscreenPlayerOpen(false);
  }, []);

  const handleCloseFullscreen = useCallback(() => {
    if (fullscreenPlayerOpen) {
      setFullscreenPlayerOpen(false);
    } else if (isFullscreenRoute) {
      navigate("/", { replace: true });
    }
  }, [fullscreenPlayerOpen, isFullscreenRoute, navigate]);

  useEffect(() => {
    if (isFullscreenPlayer && !hasCurrentTrack) {
      handleCloseFullscreen();
    }
  }, [isFullscreenPlayer, hasCurrentTrack, handleCloseFullscreen]);

  const setRightDrawerTab = useCallback((tab: "queue" | "lyrics") => {
    setRightDrawerTabState(tab);
    localStorage.setItem("liner_right_drawer_tab", tab);
  }, []);

  const openRightPanel = useCallback(
    (tab: "queue" | "lyrics") => {
      setRightDrawerTab(tab);
      setQueuePopupOpen(true);
    },
    [setRightDrawerTab],
  );
  const closeRightPanel = useCallback(() => setQueuePopupOpen(false), []);

  const isBackNavigableRoute =
    pathname === "/artist" ||
    pathname === "/library/playlist" ||
    pathname === "/collection";
  const handleEscapeFallback = useCallback(() => {
    if (queuePopupOpen || searchOpen || isFullscreenPlayer) return false;
    if (!isBackNavigableRoute) return false;
    if (window.history.length > 1) navigate(-1);
    else navigate("/library");
    return true;
  }, [isBackNavigableRoute, queuePopupOpen, searchOpen, isFullscreenPlayer, navigate]);

  useDisableButtonFocus();

  useGlobalShortcuts({
    searchOpen,
    openSearch,
    closeSearch,
    rightPanelOpen: queuePopupOpen,
    rightPanelTab: rightDrawerTab,
    openRightPanel,
    closeRightPanel,
    fullscreenOpen: isFullscreenPlayer,
    openFullscreen: openFullscreenPlayer,
    closeFullscreen: handleCloseFullscreen,
    onEscapeFallback: handleEscapeFallback,
  });
  const [searchScrollMask, setSearchScrollMask] = useState(
    "linear-gradient(to bottom, black 0%, black 100%)",
  );

  useEffect(() => {
    if (isFullscreenPlayer) {
      setQueuePopupOpen(false);
      closeSearch();
    }
  }, [isFullscreenPlayer, closeSearch]);

  useEffect(() => {
    const onGlobalPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (
        target instanceof Element &&
        (target.closest("[data-dialog-container]") ||
          target.closest("[data-dialog-backdrop]") ||
          target.closest("[data-dropdown-menu]"))
      ) {
        return;
      }
      if (searchOpen) {
        if (searchPopupRef.current?.contains(target)) {
          return;
        }
        if (sidebarRef.current?.contains(target)) {
          return;
        }
        closeSearch();
      }
      if (queuePopupOpen) {
        if (queueDrawerRef.current?.contains(target)) {
          return;
        }
        if (miniPlayerContainerRef.current?.contains(target)) {
          return;
        }
        if (sidebarRef.current?.contains(target)) {
          return;
        }
        if (
          event.clientY <= 32 ||
          (target instanceof Element && target.closest("[data-window-drag]"))
        ) {
          return;
        }
        if (queuePopupOpen) {
          handleQueuePopupToggle(false);
        }
      }
    };

    document.addEventListener("mousedown", onGlobalPointerDown, true);
    return () => {
      document.removeEventListener("mousedown", onGlobalPointerDown, true);
    };
  }, [searchOpen, queuePopupOpen, handleQueuePopupToggle]);

  const handleSearchToggle = useCallback(() => {
    toggleSearch();
  }, [toggleSearch]);

  const handleSelectHistoryQuery = useCallback(
    (queryText: string) => {
      selectHistoryQuery(queryText);
      searchInputRef.current?.focus();
    },
    [selectHistoryQuery],
  );

  const shellBackground = useShellBackground();
  const { hasCustomBg, usesAmbient, mainStyle } = shellBackground;

  return (
    <div
      ref={appFrameRef}
      data-custom-bg={hasCustomBg ? "true" : undefined}
      data-ambient={usesAmbient ? "true" : undefined}
      className="relative flex flex-row h-full w-full overflow-hidden rounded-5xl bg-bg-canvas p-1.5 gap-1.5"
      onScroll={(e) => {
        if (e.currentTarget.scrollLeft !== 0) e.currentTarget.scrollLeft = 0;
        if (e.currentTarget.scrollTop !== 0) e.currentTarget.scrollTop = 0;
      }}
    >
      <ShellBackground background={shellBackground} className="rounded-5xl" />

      <aside
        ref={sidebarRef}
        className="w-[58px] h-full shrink-0 z-[45] relative"
      >
        <Sidebar
          searchOpen={searchOpen}
          onSearchToggle={handleSearchToggle}
        />
      </aside>

      <div className="flex-1 flex flex-col min-w-0 h-full relative gap-1.5 overflow-hidden">
        <main
          data-custom-bg={hasCustomBg ? "true" : undefined}
          className={`flex-1 min-w-0 flex flex-col relative h-full ${
            hasCustomBg ? "" : "bg-bg-primary"
          } rounded-sm ${
            isFullscreenPlayer
              ? "rounded-tr-none"
              : "rounded-tr-xl"
          } overflow-hidden`}
          style={mainStyle}
        >
          <div
            ref={mainScrollRef}
            className={`h-full ${
              searchOpen || isFullscreenPlayer
                ? "overflow-hidden"
                : "overflow-y-auto"
            }`}
          >

            <PageTransition>
              {isFullscreenRoute ? shellChildrenRef.current : children}
            </PageTransition>
          </div>

          <AnimatePresence>
            {searchOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 bg-black/12 backdrop-blur-[2px] pointer-events-auto z-[30]"
                onClick={() => closeSearch()}
              />
            )}
          </AnimatePresence>

          {!isFullscreenPlayer && (
            <AnimatePresence initial={false}>
              {isRightDrawerOpen && (
                <motion.aside
                  key="right-drawer"
                  ref={queueDrawerRef}
                  initial={{ x: RIGHT_DRAWER_WIDTH }}
                  animate={{ x: 0 }}
                  exit={{ x: RIGHT_DRAWER_WIDTH }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-auto absolute inset-y-0 right-0 z-[50]"
                  style={{ width: RIGHT_DRAWER_WIDTH }}
                >
                  <RightDrawer
                    activeTab={rightDrawerTab}
                    onTabChange={setRightDrawerTab}
                    onClose={closeRightPanel}
                  />
                </motion.aside>
              )}
            </AnimatePresence>
          )}
        </main>

        {shouldShowMiniPlayer && (
          <div
            ref={miniPlayerContainerRef}
            // Above the right drawer (z-50) so the player's volume/speed/queue
            // popups, which live in this stacking context, aren't hidden by it.
            className="relative z-[55] w-full shrink-0"
          >
            <MiniPlayer
              embedded
              onQueueOpenChange={handleQueuePopupToggle}
              onQueueToggle={handleQueuePopupToggleRequest}
              onFullscreenOpen={openFullscreenPlayer}
            />
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {fullscreenPlayerOpen ? (
          <motion.div
            key="fullscreen-player-overlay"
            data-theme="dark"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onAnimationComplete={() => setFullscreenEffectsReady(fullscreenPlayerOpen)}
            className="dark absolute inset-0 z-[70] overflow-hidden bg-black will-change-transform"
          >
            <FullscreenPlayer
              onClose={closeFullscreenPlayer}
              effectsReady={fullscreenEffectsReady}
            />
          </motion.div>
        ) : isFullscreenRoute ? (
          <div data-theme="dark" className="dark absolute inset-0 z-[70] overflow-hidden bg-black">
            {children}
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {searchOpen && (
          <motion.div
            key="search-popup-wrapper"
            ref={searchPopupRef}
            initial={{ opacity: 0, y: -12, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.99 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={`absolute right-0 z-[60] flex flex-col items-center pointer-events-none pt-[56px]`}
            style={{
              left: SIDEBAR_WIDTH + SHELL_EDGE_GAP,
              right: SHELL_EDGE_GAP,
              top: 12,
            }}
          >
            {/* 1. Search Input Island */}
            <div
              className="w-[min(660px,calc(100vw-72px))] h-[54px] rounded-[8px] pointer-events-auto flex items-center px-[18px] gap-[14px] bg-bg-panel/95 border border-border-primary/50 backdrop-blur-2xl"
            >
              <span className="shrink-0 flex items-center justify-center text-text-tertiary">
                <AnimatePresence mode="wait" initial={false}>
                  {searchLoading ? (
                    <motion.span
                      key="loader"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.1 }}
                      className="inline-block h-[17px] w-[17px] rounded-full border-[1.5px] border-text-secondary border-t-transparent animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <motion.span
                      key="icon"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.1 }}
                      className="inline-flex text-text-tertiary"
                    >
                      <Search3Line size={19} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>

              <input
                ref={searchInputRef}
                type="text"
                placeholder={t("common.search")}
                autoFocus
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitSearchQuery(searchQuery);
                    runSearchNow();
                  }
                }}
                className="w-full flex-1 bg-transparent border-none outline-none text-text-primary text-[16px] placeholder:text-text-tertiary font-[400] tracking-tight"
                style={{
                  fontFamily: "var(--font-inter), sans-serif",
                  lineHeight: "1.2",
                }}
              />

              {/* Right: Appearing clear button */}
              <AnimatePresence>
                {searchQuery.length > 0 && (
                  <motion.button
                    key="clear-btn"
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.12 }}
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      setSearchQuery("");
                      searchInputRef.current?.focus();
                    }}
                    className="shrink-0 text-text-tertiary hover:text-text-primary transition-colors border-none bg-transparent p-0 flex items-center justify-center cursor-pointer"
                  >
                    <CloseCircleFill size={18} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence mode="wait">
              {hasSearchQuery ? (
                <motion.div
                  key="search-results-island"
                  initial={{ opacity: 0, y: -6, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.99 }}
                  transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
                  className="w-[min(660px,calc(100vw-72px))] mt-[8px] max-h-[500px] h-[500px] rounded-[8px] pointer-events-auto flex flex-col overflow-hidden bg-bg-panel/95 border border-border-primary/50 backdrop-blur-2xl"
                >
                  <div className="flex gap-[6px] px-[14px] pt-[12px] pb-[6px] shrink-0 overflow-x-auto">
                    {SEARCH_FILTER_KEYS.map((key) => {
                      const label = filterLabels[key];
                      const isActive = activeFilter === key;
                      const Icon = SEARCH_FILTER_ICONS[key];

                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setActiveFilter(key)}
                          className={`
                            relative flex items-center gap-[7px] px-[13px] py-[7px] rounded-[6px] text-[13.5px] font-normal transition-colors border-none bg-transparent cursor-pointer select-none shrink-0
                            ${
                              isActive
                                ? "text-text-primary font-medium"
                                : "text-text-secondary hover:text-text-primary hover:bg-border-alpha-14"
                            }
                          `}
                          style={{
                            fontFamily: "var(--font-inter), sans-serif",
                            lineHeight: "1.2",
                          }}
                        >
                          {isActive && (
                            <motion.div
                              layoutId="activeFilterPill"
                              className="absolute inset-0 rounded-[6px] bg-border-alpha-14 pointer-events-none z-0"
                              transition={{
                                type: "spring",
                                stiffness: 450,
                                damping: 35,
                              }}
                            />
                          )}
                          <span className="relative z-[1] flex items-center gap-[7px]">
                            <Icon size={15} />
                            <span>{label}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="relative flex-1 min-h-0 overflow-hidden">
                    <AnimatePresence mode="wait">
                      {isSearchEmpty ? (
                        <motion.div
                          key="search-empty"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.08 }}
                          className="flex h-full flex-col items-center justify-center gap-[6px] px-[20px] text-center"
                        >
                          <p
                            className="m-0 text-[14px] text-text-primary font-medium"
                            style={{
                              fontFamily: "var(--font-inter), sans-serif",
                            }}
                          >
                            {t("common.no_results")}
                          </p>
                          <p
                            className="m-0 text-[12px] text-text-tertiary"
                            style={{
                              fontFamily: "var(--font-inter), sans-serif",
                            }}
                          >
                            {t("common.try_another_search")}
                          </p>
                        </motion.div>
                      ) : searchResults.length > 0 ? (
                        <motion.div
                          key={`search-results-${activeFilter}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.08 }}
                          className="h-full w-full"
                        >
                          <SearchResultsList
                            items={searchResults}
                            isArtistSearchFilter={isArtistSearchFilter}
                            isPlaylistSearchFilter={isPlaylistSearchFilter}
                            onPlayFromSearch={handlePlayFromSearch}
                            onNavigateItem={handleNavigateItem}
                            onScroll={updateSearchMask}
                            scrollRef={searchScrollRef}
                            maskStyle={{
                              WebkitMaskImage: searchScrollMask,
                              maskImage: searchScrollMask,
                            }}
                            partialWarning={partialWarning}
                          />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </motion.div>
              ) : historyItems.length > 0 ? (
                <motion.div
                  key="search-history-island"
                  initial={{ opacity: 0, y: -6, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.99 }}
                  transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
                  className="w-[min(660px,calc(100vw-72px))] mt-[8px] max-h-[480px] h-auto rounded-[8px] pointer-events-auto flex flex-col overflow-hidden bg-bg-panel/95 border border-border-primary/50 backdrop-blur-2xl"
                >
                  <SearchHistoryList
                    onSelectQuery={handleSelectHistoryQuery}
                    onPlayTrack={handlePlayFromSearch}
                    onNavigateItem={handleNavigateItem}
                    onScroll={updateSearchMask}
                    scrollRef={searchScrollRef}
                    maskStyle={{
                      WebkitMaskImage: searchScrollMask,
                      maskImage: searchScrollMask,
                    }}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>

      <AddToPlaylistModal />
      <AddToLibraryModal />
      <RemoveFromPlaylistModal />
      <RemoveFromLibraryModal />
      <ImportLikesModal />
      <CreatePlaylistModal />
      <ImportReviewModal />
      <SettingsModal />
      <UpdateModal />
      <UpdateToastBridge />
      <WindowControls
        isFullscreen={isFullscreenPlayer}
        style={{
          top: isFullscreenPlayer ? 12 : 18,
          right: isFullscreenPlayer ? 12 : 18,
          transition: "all 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
          zIndex: 80,
        }}
      />
    </div>
  );
}
