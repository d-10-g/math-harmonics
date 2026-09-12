import { useEffect, useState } from "react";
import { useXR } from "@react-three/xr";
import { Container, Text } from "@react-three/uikit";
import {
  readSpatialMenus,
  setMenuValue,
  stepMenuValue,
  type MenuItem,
  type MenuSection,
} from "../lib/spatialMenu";

// The bundled MSDF font has limited symbol coverage; keep decorative DOM
// glyphs from turning into missing-glyph boxes in headset labels.
function menuLabel(label: string) {
  return label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[·—–]/g, " - ")
    .replace(/[←‹◀⏴]/g, "<")
    .replace(/[→▶⏵]/g, ">")
    .replace(/[＋]/g, "+")
    .replace(/[−]/g, "-")
    .replace(/[×]/g, "x")
    .replace(/[✓]/g, "[selected] ")
    .replace(/[★]/g, "*")
    .replace(/[♪✦]/g, "")
    .trim();
}
export function MenuButton({
  label,
  onPress,
  active = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Container
      height={38}
      flexGrow={1}
      borderRadius={7}
      paddingX={9}
      alignItems="center"
      justifyContent="center"
      backgroundColor={disabled ? "#111522" : active ? "#4f46e5" : "#202840"}
      hover={{ backgroundColor: disabled ? "#111522" : "#394365" }}
      onPointerDown={(event: any) => {
        event.stopPropagation();
        if (!disabled) onPress();
      }}
    >
      <Text fontSize={12} color={disabled ? "#62677c" : "#f4f6ff"}>
        {menuLabel(label)}
      </Text>
    </Container>
  );
}
const PAGE_SIZE = 6;
const keyboards = [
  "1234567890",
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "+-*/().,=<>",
  "[]{}_:;!?\\",
  "@#$%^&|~\"'",
];
function Editor({
  label,
  initialValue,
  apply,
  close,
}: {
  label: string;
  initialValue: string;
  apply: (value: string) => void;
  close: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [cursor, setCursor] = useState(initialValue.length);
  const [shift, setShift] = useState(false);
  const insert = (characters: string) => {
    setValue(value.slice(0, cursor) + characters + value.slice(cursor));
    setCursor(cursor + characters.length);
  };
  return (
    <Container flexDirection="column" gap={6}>
      <Text fontSize={13} color="#c7d2fe">
        {menuLabel(label)}
      </Text>
      <Container
        height={85}
        backgroundColor="#080b14"
        padding={8}
        overflow="scroll"
      >
        <Text fontSize={12} color="#ffffff">
          {value.slice(Math.max(0, cursor - 130), cursor) +
            "|" +
            value.slice(cursor, cursor + 130)}
        </Text>
      </Container>
      <Container flexDirection="row" gap={5}>
        <MenuButton label="Home" onPress={() => setCursor(0)} />
        <MenuButton
          label="←"
          onPress={() => setCursor(Math.max(0, cursor - 1))}
        />
        <MenuButton
          label="→"
          onPress={() => setCursor(Math.min(value.length, cursor + 1))}
        />
        <MenuButton label="End" onPress={() => setCursor(value.length)} />
        <MenuButton
          label="Backspace"
          onPress={() => {
            if (cursor) {
              setValue(value.slice(0, cursor - 1) + value.slice(cursor));
              setCursor(cursor - 1);
            }
          }}
        />
      </Container>
      {keyboards.map((row) => (
        <Container key={row} flexDirection="row" gap={3}>
          {Array.from(shift ? row.toUpperCase() : row).map((character) => (
            <MenuButton
              key={character}
              label={character}
              onPress={() => insert(character)}
            />
          ))}
        </Container>
      ))}
      <Container flexDirection="row" gap={5}>
        <MenuButton
          label="Shift"
          active={shift}
          onPress={() => setShift(!shift)}
        />
        <MenuButton label="Space" onPress={() => insert(" ")} />
        <MenuButton label="Newline" onPress={() => insert("\n")} />
        <MenuButton
          label="Clear"
          onPress={() => {
            setValue("");
            setCursor(0);
          }}
        />
      </Container>
      <Container flexDirection="row" gap={5}>
        <MenuButton label="Cancel" onPress={close} />
        <MenuButton
          label="Apply"
          active
          onPress={() => {
            apply(value);
            close();
          }}
        />
      </Container>
    </Container>
  );
}
function Choices({ item, close }: { item: MenuItem; close: () => void }) {
  const [page, setPage] = useState(
    Math.max(
      0,
      Math.floor(
        item.options.findIndex((option) => option.value === item.value) /
          PAGE_SIZE,
      ),
    ),
  );
  return (
    <Container flexDirection="column" gap={6}>
      <Text fontSize={13} color="#c7d2fe">
        {item.label}
      </Text>
      {item.options
        .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
        .map((option, index) => (
          <MenuButton
            key={index}
            label={option.label}
            active={item.value === option.value}
            disabled={option.disabled}
            onPress={() => {
              setMenuValue(item, option.value);
              close();
            }}
          />
        ))}
      <Pager page={page} count={item.options.length} setPage={setPage} />
      <MenuButton label="Back" onPress={close} />
    </Container>
  );
}
function Pager({
  page,
  count,
  setPage,
}: {
  page: number;
  count: number;
  setPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  return (
    <Container flexDirection="row" gap={6} alignItems="center">
      <MenuButton
        label="Previous"
        disabled={page === 0}
        onPress={() => setPage(page - 1)}
      />
      <Text fontSize={12} color="#99a3c5">{`${page + 1} / ${pages}`}</Text>
      <MenuButton
        label="Next"
        disabled={page >= pages - 1}
        onPress={() => setPage(page + 1)}
      />
    </Container>
  );
}
export default function SpatialMenus() {
  const session = useXR((state) => state.session);
  const [sections, setSections] = useState<MenuSection[]>([]);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  // Timer works during immersive sessions, when window rAF is suspended. Only
  // active while this tab is mounted; observes properties as well as attributes.
  useEffect(() => {
    let fingerprint = "";
    const refresh = () => {
      const next = readSpatialMenus(document);
      const signature = JSON.stringify(next, (key, value) =>
        key === "element" ? undefined : value,
      );
      if (signature !== fingerprint) {
        fingerprint = signature;
        setSections(next);
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 250);
    return () => window.clearInterval(timer);
  }, []);
  const section = sections.find((candidate) => candidate.id === sectionId);
  const items =
    section?.items.filter((item) =>
      `${item.label} ${item.value}`.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  const count = section ? items.length : sections.length;
  const safePage = Math.min(
    page,
    Math.max(0, Math.ceil(count / PAGE_SIZE) - 1),
  );
  const changeSection = (id: string | null) => {
    setSectionId(id);
    setPage(0);
    setNotice("");
    setQuery("");
  };
  if (searching)
    return (
      <Editor
        label="Find a control or preset"
        initialValue={query}
        apply={(value) => {
          setQuery(value);
          setPage(0);
        }}
        close={() => setSearching(false)}
      />
    );
  if (editing)
    return editing.kind === "select" ? (
      <Choices item={editing} close={() => setEditing(null)} />
    ) : (
      <Editor
        label={editing.label}
        initialValue={editing.value}
        apply={(value) => setMenuValue(editing, value)}
        close={() => setEditing(null)}
      />
    );
  const activate = (item: MenuItem) => {
    if (item.disabled || !item.element.isConnected) return;
    if (item.kind === "text" || item.kind === "select") {
      setEditing(item);
      return;
    }
    const click = () => {
      if (item.element.isConnected) item.element.click();
    };
    if (item.browserOnly && session) {
      // OS pickers and browser-only previews cannot be drawn into an XR layer.
      // End XR before opening them, while this user activation is still live.
      void session
        .end()
        .then(click)
        .catch((error) => setNotice(error.message));
      return;
    }
    try {
      click();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to open this control.",
      );
    }
  };
  return (
    <Container flexDirection="column" gap={7}>
      {section && (
        <MenuButton
          label={`‹ ALL MENUS · ${section.label}`}
          onPress={() => changeSection(null)}
        />
      )}
      {section && (
        <MenuButton
          label={
            query ? `SEARCH: ${query} · ${count} matches` : "Search this menu"
          }
          onPress={() => setSearching(true)}
        />
      )}
      {!section
        ? sections
            .slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
            .map((entry) => (
              <MenuButton
                key={entry.id}
                label={entry.label}
                onPress={() => changeSection(entry.id)}
              />
            ))
        : items
            .slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
            .map((item) => {
              if (item.kind === "number")
                return (
                  <Container key={item.id} flexDirection="column" gap={3}>
                    <Text
                      fontSize={11}
                      color="#bbc4e4"
                    >{`${item.label} · ${item.value}`}</Text>
                    <Container flexDirection="row" gap={6}>
                      <MenuButton
                        label="−"
                        disabled={item.disabled || +item.value <= item.min}
                        onPress={() => stepMenuValue(item, -1)}
                      />
                      <MenuButton
                        label={`${item.value}  EDIT`}
                        disabled={item.disabled}
                        onPress={() => setEditing({ ...item, kind: "text" })}
                      />
                      <MenuButton
                        label="+"
                        disabled={item.disabled || +item.value >= item.max}
                        onPress={() => stepMenuValue(item, 1)}
                      />
                    </Container>
                  </Container>
                );
              if (item.kind === "audio") {
                const audio = item.element as HTMLAudioElement;
                return (
                  <Container key={item.id} flexDirection="column" gap={5}>
                    <Text fontSize={12} color="#bbc4e4">
                      {item.value}
                    </Text>
                    <Container flexDirection="row" gap={5}>
                      <MenuButton
                        label="−10s"
                        onPress={() => {
                          audio.currentTime = Math.max(
                            0,
                            audio.currentTime - 10,
                          );
                        }}
                      />
                      <MenuButton
                        label={audio.paused ? "Play" : "Pause"}
                        onPress={() => {
                          if (audio.paused)
                            void audio
                              .play()
                              .catch((error) => setNotice(error.message));
                          else audio.pause();
                        }}
                      />
                      <MenuButton
                        label="+10s"
                        onPress={() => {
                          if (Number.isFinite(audio.duration))
                            audio.currentTime = Math.min(
                              audio.duration,
                              audio.currentTime + 10,
                            );
                        }}
                      />
                    </Container>
                    <Container flexDirection="row" gap={5}>
                      <MenuButton
                        label="Volume −"
                        onPress={() => {
                          audio.volume = Math.max(0, audio.volume - 0.1);
                        }}
                      />
                      <MenuButton
                        label={audio.muted ? "Unmute" : "Mute"}
                        onPress={() => {
                          audio.muted = !audio.muted;
                        }}
                      />
                      <MenuButton
                        label="Volume +"
                        onPress={() => {
                          audio.volume = Math.min(1, audio.volume + 0.1);
                        }}
                      />
                    </Container>
                  </Container>
                );
              }
              const value =
                item.kind === "select"
                  ? item.options.find((option) => option.value === item.value)
                      ?.label
                  : item.kind === "text"
                    ? item.value.slice(0, 55)
                    : "";
              return (
                <MenuButton
                  key={item.id}
                  label={`${item.active ? "✓ " : ""}${item.label}${item.browserOnly ? " (browser)" : ""}${value ? ` · ${value}` : ""}`}
                  active={item.active}
                  disabled={item.disabled}
                  onPress={() => activate(item)}
                />
              );
            })}
      {items.some((item) => item.browserOnly) && (
        <Text fontSize={10} color="#99a3c5">
          Browser actions leave immersive mode. Enter VR again when finished.
        </Text>
      )}
      <Pager page={safePage} count={count} setPage={setPage} />
      {!!section?.messages.length && (
        <Container
          maxHeight={120}
          overflow="scroll"
          flexDirection="column"
          gap={5}
        >
          {section.messages.map((message, index) => (
            <Text key={index} fontSize={11} color="#fbbf24">
              {message}
            </Text>
          ))}
        </Container>
      )}
      {notice && (
        <Text fontSize={11} color="#fbbf24">
          {notice}
        </Text>
      )}
    </Container>
  );
}
