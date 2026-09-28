import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, Smile } from "lucide-react";
import { cn } from "@/lib/utils";
import { getChatGifs } from "@/lib/meetings-chat-calls";
import type { GifObject } from "@shared/api";

/**
 * WhatsApp-style Emoji | Stickers | GIF picker that attaches above the chat
 * composer.
 *
 *  - Emoji    : categorized grid; clicking sends the emoji instantly.
 *  - Stickers : curated "big emoji" stickers; clicking sends a
 *               messageType='sticker' message (rendered ~96px, bubble-less).
 *  - GIF      : Tenor proxy (GET /chat/gifs). Only shown when the backend
 *               reports configured=true. Trending by default + debounced
 *               search; clicking sends a gif attachment message.
 */
export function StickerEmojiGifPanel({
  onEmojiSelect,
  onStickerSelect,
  onGifSelect,
  className,
}: {
  /** Instant-send emoji (WhatsApp behavior). */
  onEmojiSelect: (emoji: string) => void;
  /** Instant-send big-emoji sticker. */
  onStickerSelect: (emoji: string) => void;
  /** Send the GIF as an attachment message. */
  onGifSelect: (gif: GifObject) => void;
  className?: string;
}) {
  const [tab, setTab] = useState<"emoji" | "stickers" | "gif">("emoji");
  const [gifConfigured, setGifConfigured] = useState<boolean | null>(null);
  const checkedConfigRef = useRef(false);

  // Check GIF availability once so we know whether to show the tab.
  useEffect(() => {
    if (checkedConfigRef.current) return;
    checkedConfigRef.current = true;
    let disposed = false;
    getChatGifs("", 1)
      .then((res) => {
        if (!disposed) setGifConfigured(!!res.configured);
      })
      .catch(() => {
        if (!disposed) setGifConfigured(false);
      });
    return () => {
      disposed = true;
    };
  }, []);

  // Flip off the GIF tab if the backend is not configured.
  useEffect(() => {
    if (gifConfigured === false && tab === "gif") setTab("emoji");
  }, [gifConfigured, tab]);

  const tabs = useMemo(
    () => [
      { id: "emoji" as const, label: "Emoji" },
      { id: "stickers" as const, label: "Stickers" },
      ...(gifConfigured ? [{ id: "gif" as const, label: "GIF" }] : []),
    ],
    [gifConfigured]
  );

  return (
    <div
      className={cn(
        "mb-2 w-[320px] max-w-[92vw] overflow-hidden rounded-2xl border bg-card shadow-lg",
        className
      )}
    >
      <div className="flex items-center gap-1 border-b border-border/70 px-2 py-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              tab === t.id
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "emoji" && <EmojiGrid onSelect={onEmojiSelect} />}
      {tab === "stickers" && <StickerGrid onSelect={onStickerSelect} />}
      {tab === "gif" && <GifGrid onSelect={onGifSelect} />}
    </div>
  );
}

// ==========================================
// Emoji tab — categorized grid (~240 emojis)
// ==========================================

const EMOJI_CATEGORIES: { name: string; emojis: string[] }[] = [
  {
    name: "Smileys & People",
    emojis: [
      "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩",
      "😘","😗","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐",
      "🤨","😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒",
      "🤕","🤢","🤮","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸","😎","🤓","🧐","😕","😟",
      "🙁","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣",
      "😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","💩","🤡","👹","👺",
      "👻","👽","🤖","😺","😸","😹","😻","😼","😽","🙀","😿","😾",
    ],
  },
  {
    name: "Gestures",
    emojis: [
      "👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆",
      "🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️",
      "💅","🤳","💪","🦾","🦿","🦵","🦶","👂","🦻","👃","🧠","🫀","🫁","🦷","🦴","👀",
      "👁️","👅","👄","💋","🩸",
    ],
  },
  {
    name: "Hearts & Symbols",
    emojis: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖",
      "💘","💝","💟","♥️","💯","💢","💥","💫","💦","💨","🕳️","💬","💭","🗯️","♻️","✅",
      "❌","❗","❓","❕","❔","‼️","⁉️","🔔","🔕","🎵","🎶","➕","➖","➗","✖️","♾️",
    ],
  },
  {
    name: "Animals & Nature",
    emojis: [
      "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨","🐯","🦁","🐮","🐷","🐸","🐵",
      "🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🐣","🐥","🦆","🦅","🦉","🦇","🐺","🐗",
      "🐴","🦄","🐝","🪱","🐛","🦋","🐌","🐞","🐜","🪰","🕷️","🦂","🐢","🐍","🦎","🦖",
      "🐙","🦑","🦐","🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓",
      "🦍","🐘","🦛","🐪","🦒","🦘","🐃","🐂","🐄","🐎","🐖","🐏","🐑","🦙","🐐","🦌",
      "🐕","🐩","🦮","🐈","🐈‍⬛","🐓","🦃","🦚","🦜","🦢","🐇","🦝","🦨","🦡","🦫","🦦",
      "🌱","🌿","🍀","🌵","🌴","🌲","🌳","🌸","🌺","🌻","🌼","🌷","🌹","🥀","💐","🍂",
      "🍁","🌾","🌊","🔥","⭐","🌟","✨","⚡","🌈","☀️","⛅","🌧️","⛈️","❄️","⛄","🌙",
    ],
  },
  {
    name: "Food & Drink",
    emojis: [
      "🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥",
      "🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌶️","🫑","🌽","🥕","🧄","🧅","🥔","🍠","🥐",
      "🥯","🍞","🥖","🫓","🥨","🧀","🥚","🍳","🧈","🥞","🧇","🥓","🥩","🍗","🍖","🌭",
      "🍔","🍟","🍕","🥪","🥙","🧆","🌮","🌯","🫔","🥗","🥘","🫕","🥫","🍝","🍜","🍲",
      "🍛","🍣","🍱","🥟","🦪","🍤","🍙","🍚","🍘","🍥","🥠","🥮","🍢","🍡","🍧","🍨",
      "🍦","🥧","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍩","🍪","🌰","🥜","🍯","🥛","🍼",
      "☕","🫖","🍵","🧃","🥤","🧋","🍶","🍺","🥂","🍷","🥃","🍸","🍹","🧉",
    ],
  },
  {
    name: "Activities & Travel",
    emojis: [
      "⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🪀","🏓","🏸","🏒","🥍","🏏",
      "🪃","🥅","⛳","🪁","🏹","🎣","🤿","🥊","🥋","🎽","🛹","🛼","🛷","⛸️","🥌","🎿",
      "⛷️","🏂","🚴","🚵","🧗","🏇","🏊","🏄","🚣","🧘","🎪","🎭","🎨","🎬","🎤","🎧",
      "🎼","🎹","🥁","🎷","🎺","🎸","🪕","🎻","🎲","♟️","🎯","🎳","🎮","🕹️","🎰","🧩",
      "🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🛵","🏍️",
      "🚲","✈️","🚀","🛸","🚁","⛵","🚤","🛥️","🛳️","🚢","🚂","🚆","🏝️","🏔️","🌋","🎡",
      "🎢","🎠","⛱️","🏖️","🎡","🎆","🎇","🎉","🎊","🎈","🎁","🎀","🏆","🥇","🥈","🥉",
    ],
  },
  {
    name: "Objects",
    emojis: [
      "⌚","📱","💻","⌨️","🖥️","🖨️","🖱️","💾","💿","📀","📷","📸","📹","🎥","📞","☎️",
      "📺","📻","⏰","⏱️","⌛","🔋","🔌","💡","🔦","🕯️","🧯","🛢️","💸","💵","💰","🧾",
      "💎","⚖️","🔧","🔨","⛏️","🔩","⚙️","🧲","💊","💉","🩹","🩺","🚪","🪑","🚽",
      "🚿","🛁","🧴","🧷","🧹","🧺","🧻","🧼","🪥","🧽","🛒","⚰️","🗿","🔮","📿",
      "🪄","🧸","📚","📖","📗","📘","📙","📓","📔","📒","📃","📜","📄","📰",
      "🗞️","📑","🔖","🏷️","✉️","📩","📨","📧","💌","📮","📪","📦","📫","📬","🗂️","📁",
      "🗑️","📝","✏️","🖊️","🖋️","🖍️","🖌️","🔍","🔎","🔐","🔒","🔓","🔑","🗝️",
    ],
  },
];

function EmojiGrid({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <div className="max-h-[320px] overflow-y-auto p-2 chat-panel-scroll">
      {EMOJI_CATEGORIES.map((category) => (
        <div key={category.name} className="mb-2">
          <p className="sticky top-0 z-10 bg-card/95 px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
            {category.name}
          </p>
          <div className="grid grid-cols-8 gap-0.5">
            {category.emojis.map((emoji, idx) => (
              <button
                key={`${category.name}-${idx}`}
                type="button"
                onClick={() => onSelect(emoji)}
                title={emoji}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-xl transition-colors hover:bg-accent active:scale-95"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ==========================================
// Stickers tab — big-emoji stickers
// ==========================================

const STICKER_SET = [
  "😂","🥹","😍","🤯","🥳","😎","🤩","😭","🤬","😱","🤗","🤫","🤔","🫡","🫠","😤",
  "🤪","🥶","🥵","😈","👻","🤖","👽","🎃","🐝","🦄","🐙","🐸","🐬","🦖","🦋","🍀",
  "🌵","🌈","⚡","🔥","💥","💎","🎉","🎊","🎈","🎁","🏆","🥇","🎯","🎸","🚀","🛸",
  "💯","👀","💀","🤡","💔","💖","🙏","👏","💪","🫶","🤙","🖖","🍕","🍔","🍩","☕",
  "🍺","🍰","🍉","⚽","🏀","🎮","🎲","🎤","🎧","📸","💡","🌙","☀️","⭐","🐱","🐶",
];

function StickerGrid({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <div className="max-h-[320px] overflow-y-auto p-2 chat-panel-scroll">
      <div className="grid grid-cols-4 gap-1">
        {STICKER_SET.map((emoji, idx) => (
          <button
            key={`sticker-${idx}-${emoji}`}
            type="button"
            onClick={() => onSelect(emoji)}
            title={`Send ${emoji} sticker`}
            className="flex h-[74px] items-center justify-center rounded-xl text-[44px] leading-none transition-transform hover:scale-105 hover:bg-accent/60 active:scale-95"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// GIF tab — Tenor proxy with debounced search
// ==========================================

function GifGrid({ onSelect }: { onSelect: (gif: GifObject) => void }) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [gifs, setGifs] = useState<GifObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Debounce the search input (300ms).
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const fetchGifs = useCallback(async (query: string, signal: { aborted: boolean }) => {
    setLoading(true);
    setError(false);
    try {
      const res = await getChatGifs(query, 16);
      if (signal.aborted) return;
      setGifs(res.gifs || []);
    } catch {
      if (!signal.aborted) {
        setError(true);
        setGifs([]);
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const signal = { aborted: false };
    fetchGifs(debounced, signal);
    return () => {
      signal.aborted = true;
    };
  }, [debounced, fetchGifs]);

  return (
    <div className="flex max-h-[320px] flex-col">
      <div className="relative p-2 pb-1.5">
        <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={debounced ? "Search Tenor…" : "Search GIFs (trending)"}
          aria-label="Search GIFs"
          className="h-8 w-full rounded-lg border border-border/70 bg-muted/50 pl-8 pr-2 text-xs outline-none transition-colors focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
        />
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 chat-panel-scroll">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-40 flex-col items-center justify-center gap-1 text-center">
            <Smile className="h-6 w-6 text-muted-foreground/60" />
            <p className="text-xs text-muted-foreground">Could not load GIFs. Try again.</p>
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
            No GIFs found
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => onSelect(gif)}
                title={gif.description || "Send GIF"}
                className="group relative overflow-hidden rounded-lg bg-muted/60 transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                <img
                  src={gif.previewUrl || gif.url}
                  alt={gif.description || "GIF"}
                  loading="lazy"
                  draggable={false}
                  className="h-[104px] w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
