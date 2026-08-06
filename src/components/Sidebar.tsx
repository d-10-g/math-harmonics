import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Shuffle, Sparkles, Star } from 'lucide-react';
import { Formula, PRESET_FORMULAS, ShaderPreset } from '../constants';
import { PRESET_SHADERS } from '../shaders';
import { cn } from '../lib/utils';
import { formulaThumbnail, shaderThumbnail } from '../lib/thumbnails';
import { COMBOS, Combo } from '../lib/combos';

interface SidebarProps {
  selectedFormula: Formula;
  onSelect: (formula: Formula) => void;
  onApplyCombo: (combo: Combo) => void;
  onPlayDemo: () => void;
  audioSync: boolean;
  selectedShader: ShaderPreset;
  onSelectShader: (shader: ShaderPreset) => void;
  activeTab: 'formulas' | 'shaders';
  setActiveTab: (tab: 'formulas' | 'shaders') => void;
}

type LibraryItem = {
  id: string;
  name: string;
  description: string;
  category?: string;
  source: string;
  index: number;
  kind: 'formula' | 'shader';
};

const FAVORITES_KEY = 'harmonics.favorites.v1';
const FAVORITES_CATEGORY = '★ Favs';

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // Corrupt storage falls through to an empty set.
  }
  return new Set();
}

function saveFavorites(favorites: Set<string>) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  } catch {
    // Storage may be unavailable; favorites just won't persist.
  }
}

function categoryLabel(category?: string) {
  if (!category) return 'Core';
  if (category.includes('Audio-reactive')) return 'Audio';
  if (category.includes('Parametric surfaces')) return 'Surfaces';
  if (category.includes('Parameter-evolving')) return 'Evolving';
  if (category.includes('Coordinate-dependent')) return 'Coordinate';
  if (category.includes('State-dependent')) return 'Switching';
  if (category.includes('mutation')) return 'Mutation';
  if (category.includes('Organic')) return 'Organic';
  if (category.includes('R185 TSL')) return 'TSL Lab';
  if (category.includes('WebGPU TSL')) return 'WebGPU TSL';
  if (category.includes('Volumetric')) return 'Volume';
  if (category.includes('HTMLTexture')) return 'HTML UI';
  if (category.includes('WebGPU XR')) return 'XR Light';
  return category;
}

function itemKey(item: LibraryItem) {
  return `${item.kind}-${item.id}`;
}

// Generates its thumbnail lazily: only once scrolled near the viewport, and
// during idle time so fast scrolling stays smooth. Cached per id in
// lib/thumbnails, so revisits are instant.
function PresetThumb({ item }: { item: LibraryItem }) {
  const [src, setSrc] = useState<string | null>(null);
  const holderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSrc(null);
    const holder = holderRef.current;
    if (!holder) return;

    let cancelled = false;
    const generate = () => {
      if (cancelled) return;
      const url = item.kind === 'formula'
        ? formulaThumbnail(PRESET_FORMULAS[item.index])
        : shaderThumbnail(PRESET_SHADERS[item.index]);
      if (!cancelled) setSrc(url || null);
    };

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        const idle = (window as any).requestIdleCallback as ((cb: () => void) => number) | undefined;
        if (idle) idle(generate);
        else window.setTimeout(generate, 30);
      }
    }, { rootMargin: '160px' });

    observer.observe(holder);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [item.kind, item.id, item.index]);

  return (
    <div
      ref={holderRef}
      className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/40"
      aria-hidden="true"
    >
      {src && <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />}
    </div>
  );
}

export default function Sidebar({
  selectedFormula,
  onSelect,
  onApplyCombo,
  onPlayDemo,
  audioSync,
  selectedShader,
  onSelectShader,
  activeTab,
  setActiveTab
}: SidebarProps) {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);

  const items = useMemo<LibraryItem[]>(() => {
    if (activeTab === 'formulas') {
      return PRESET_FORMULAS.map((formula, index) => ({
        id: formula.id,
        name: formula.name,
        description: formula.description,
        category: formula.category,
        source: formula.category || formula.x,
        index,
        kind: 'formula'
      }));
    }

    return PRESET_SHADERS
      .map((shader, index) => ({
        id: shader.id,
        name: shader.name,
        description: shader.description,
        category: shader.category,
        source: shader.category || shader.description,
        index,
        kind: 'shader' as const
      }))
      // Audio-reactive shaders only exist while audio sync runs — hidden
      // otherwise so they never present as "broken" static visuals.
      .filter((item) => audioSync || item.category !== 'Audio-reactive shaders');
  }, [activeTab, audioSync]);

  const selectedItem = useMemo<LibraryItem>(() => {
    if (activeTab === 'formulas') {
      const index = PRESET_FORMULAS.findIndex((formula) => formula.id === selectedFormula.id);
      return {
        id: selectedFormula.id,
        name: selectedFormula.name,
        description: selectedFormula.description,
        category: selectedFormula.category,
        source: selectedFormula.category || selectedFormula.x,
        index: index === -1 ? 0 : index,
        kind: 'formula'
      };
    }

    const index = PRESET_SHADERS.findIndex((shader) => shader.id === selectedShader.id);
    return {
      id: selectedShader.id,
      name: selectedShader.name,
      description: selectedShader.description,
      category: selectedShader.category,
      source: selectedShader.category || selectedShader.description,
      index: index === -1 ? 0 : index,
      kind: 'shader'
    };
  }, [activeTab, selectedFormula, selectedShader]);

  const favoriteCount = useMemo(
    () => items.reduce((count, item) => count + (favorites.has(itemKey(item)) ? 1 : 0), 0),
    [items, favorites]
  );

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((item) => {
      const label = categoryLabel(item.category);
      counts.set(label, (counts.get(label) || 0) + 1);
    });

    return [
      { label: 'All', count: items.length },
      { label: FAVORITES_CATEGORY, count: favoriteCount },
      ...Array.from(counts, ([label, count]) => ({ label, count }))
        .sort((a, b) => {
          if (a.label === 'Core') return -1;
          if (b.label === 'Core') return 1;
          return a.label.localeCompare(b.label);
        })
    ];
  }, [items, favoriteCount]);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();

    return items.filter((item) => {
      const label = categoryLabel(item.category);
      const categoryMatches = selectedCategory === 'All'
        || (selectedCategory === FAVORITES_CATEGORY ? favorites.has(itemKey(item)) : selectedCategory === label);
      const text = `${item.name} ${item.description} ${item.source} ${label}`.toLowerCase();
      return categoryMatches && (!term || text.includes(term));
    });
  }, [items, query, selectedCategory, favorites]);

  useEffect(() => {
    setQuery('');
    setSelectedCategory('All');
  }, [activeTab]);

  const selectedKey = itemKey(selectedItem);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the selection visible while cycling with keys/auto-pilot.
  useEffect(() => {
    const row = listRef.current?.querySelector(`[data-key="${CSS.escape(selectedKey)}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [selectedKey]);

  const selectItem = (item: LibraryItem) => {
    if (item.kind === 'formula') {
      onSelect(PRESET_FORMULAS[item.index]);
    } else {
      onSelectShader(PRESET_SHADERS[item.index]);
    }
  };

  const toggleFavorite = (item: LibraryItem) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      const key = itemKey(item);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      saveFavorites(next);
      return next;
    });
  };

  const selectRandom = () => {
    const pool = filteredItems.length > 0 ? filteredItems : items;
    const item = pool[Math.floor(Math.random() * pool.length)];
    if (item) selectItem(item);
  };

  return (
    <aside className="min-h-[620px] lg:min-h-0 flex flex-col gap-4 overflow-hidden">
      <div className="bg-white/5 border border-white/10 rounded-lg p-4 flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex justify-between items-center px-1">
          <div className="flex gap-2 rounded-lg bg-black/30 border border-white/10 p-1">
            <button
              onClick={() => setActiveTab('formulas')}
              className={cn(
                "px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[0.16em] transition-colors",
                activeTab === 'formulas' ? "bg-indigo-500/25 text-indigo-100" : "text-white/35 hover:text-white/70"
              )}
            >
              Formulas
            </button>
            <button
              onClick={() => setActiveTab('shaders')}
              className={cn(
                "px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[0.16em] transition-colors",
                activeTab === 'shaders' ? "bg-indigo-500/25 text-indigo-100" : "text-white/35 hover:text-white/70"
              )}
            >
              Shaders
            </button>
          </div>
          <button
            onClick={selectRandom}
            className="h-8 w-8 rounded-md border border-white/10 bg-white/5 text-white/45 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center"
            title="Random preset from the current filter"
            type="button"
          >
            <Shuffle size={14} />
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-black/25 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.18em] text-indigo-300">
                <Sparkles size={12} />
                <span>Selected</span>
              </div>
              <div className="mt-2 truncate text-sm font-semibold text-white/90">{selectedItem.name}</div>
              <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-white/38">{selectedItem.description}</div>
            </div>
            <div className="shrink-0 rounded-md bg-white/8 border border-white/10 px-2 py-1 text-[9px] font-mono uppercase text-white/45">
              {selectedItem.kind === 'formula' ? 'F' : 'S'}-{String(selectedItem.index + 1).padStart(2, '0')}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.18em] text-fuchsia-300">
            <Sparkles size={11} />
            <span>Combos — one-tap scenes</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto custom-scrollbar pb-1.5">
            <button
              onClick={onPlayDemo}
              className="shrink-0 rounded-md border border-amber-400/40 bg-gradient-to-r from-amber-500/20 to-fuchsia-500/20 px-2.5 py-1.5 text-[9px] font-mono uppercase tracking-[0.08em] text-amber-200 transition-colors hover:from-amber-500/35 hover:to-fuchsia-500/35"
              title="Play the built-in sonata demo: the score drives the visuals"
              type="button"
            >
              ♪ Sonata Demo
            </button>
            {COMBOS.map((combo) => (
              <button
                key={combo.id}
                onClick={() => onApplyCombo(combo)}
                className="shrink-0 rounded-md border border-fuchsia-400/25 bg-fuchsia-500/10 px-2.5 py-1.5 text-[9px] font-mono uppercase tracking-[0.08em] text-fuchsia-200/90 transition-colors hover:bg-fuchsia-500/25 hover:text-fuchsia-100"
                title={`${combo.name}: applies formula + material + light rig + tempo`}
                type="button"
              >
                {combo.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/35 px-3 py-2 focus-within:border-indigo-400/50">
          <Search size={14} className="text-white/30 shrink-0" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${activeTab}`}
            className="min-w-0 flex-1 bg-transparent text-xs text-white/80 placeholder:text-white/25 outline-none"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category.label}
              onClick={() => setSelectedCategory(category.label)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-[9px] font-mono uppercase tracking-[0.12em] transition-colors",
                selectedCategory === category.label
                  ? "border-indigo-400/50 bg-indigo-500/20 text-indigo-100"
                  : "border-white/10 bg-white/[0.04] text-white/38 hover:text-white/70 hover:bg-white/[0.08]"
              )}
              type="button"
            >
              {category.label}
              <span className="ml-1.5 text-white/28">{category.count}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-[9px] font-mono uppercase tracking-[0.16em] text-white/35">
          <span>{filteredItems.length} Matches</span>
          <span>Scroll to browse</span>
        </div>

        <div ref={listRef} className="mt-3 flex-1 min-h-[300px] lg:min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-2">
          {filteredItems.map((item) => {
            const key = itemKey(item);
            const isSelected = key === selectedKey;
            const isFavorite = favorites.has(key);
            return (
              <div
                key={key}
                data-key={key}
                className={cn(
                  "w-full flex items-stretch rounded-lg border transition-all duration-200 group overflow-hidden",
                  isSelected
                    ? "bg-indigo-600/20 border-indigo-400/50"
                    : "bg-white/[0.045] border-white/8 hover:border-white/20 hover:bg-white/[0.08]"
                )}
              >
                <button
                  onClick={() => selectItem(item)}
                  className="flex-1 min-w-0 text-left p-2.5 flex items-center gap-3"
                  type="button"
                >
                  <PresetThumb item={item} />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between items-start mb-0.5">
                      <div className={cn(
                        "text-[9px] font-mono uppercase",
                        isSelected ? "text-indigo-200" : "text-white/30"
                      )}>
                        {categoryLabel(item.category)}
                      </div>
                      {isSelected && (
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                      )}
                    </div>
                    <div className="truncate text-[11px] font-bold uppercase tracking-wide text-white/85">{item.name}</div>
                    <div className="line-clamp-1 text-[10px] leading-4 text-white/38 group-hover:text-white/55">
                      {item.description}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => toggleFavorite(item)}
                  className={cn(
                    "shrink-0 px-2.5 flex items-center border-l transition-colors",
                    isFavorite
                      ? "border-amber-300/20 text-amber-300"
                      : "border-white/5 text-white/20 hover:text-white/60"
                  )}
                  title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  aria-pressed={isFavorite}
                  type="button"
                >
                  <Star size={13} className={isFavorite ? 'fill-amber-300' : undefined} />
                </button>
              </div>
            );
          })}

          {filteredItems.length === 0 && (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-xs text-white/35">
              {selectedCategory === FAVORITES_CATEGORY
                ? 'No favorites yet — tap the star on any preset.'
                : 'No matches.'}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-lg p-4 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[9px] text-white/30 uppercase tracking-widest font-mono mb-2">Render Stack</div>
            <div className="text-[10px] font-mono text-emerald-400">THREE_R185_ACTIVE</div>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 border border-emerald-400/15 px-2 py-1">
            <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.55)]" />
            <span className="text-[9px] font-mono uppercase text-emerald-300">Stable</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
