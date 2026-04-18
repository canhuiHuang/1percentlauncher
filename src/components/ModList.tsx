export type ModTag =
  | "required"
  | "local"
  | "ambient"
  | "util"
  | "performance"
  | "extra";

export type ModListItem = {
  key: string;
  name: string;
  tags: ModTag[];
  status?: "installed" | "missing";
  subtitle?: string;
};

function formatModName(name: string): string {
  return name.replace(/\.jar$/i, "");
}

export default function ModList({ items }: { items: ModListItem[] }) {
  return (
    <>
      {items.map((item) => (
        <div key={item.key} className="mod-row">
          <div className="mod-header">
            <div className="mod-title-row">
              <div className="mod-name" title={formatModName(item.name)}>
                {formatModName(item.name)}
              </div>
              {item.tags.map((tag) => (
                <span
                  key={`${item.key}-${tag}`}
                  className={`mod-tag mod-tag-${tag}`}
                >
                  {tag}
                </span>
              ))}
            </div>
            {item.status ? (
              <div
                className={`status-icon ${
                  item.status === "installed" ? "status-ok" : "status-bad"
                }`}
              >
                {item.status === "installed" ? "✅" : "❌"}
              </div>
            ) : null}
          </div>
          {item.subtitle ? <div className="mod-meta">{item.subtitle}</div> : null}
        </div>
      ))}
    </>
  );
}
