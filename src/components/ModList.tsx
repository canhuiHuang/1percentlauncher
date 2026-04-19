export type ModTag =
  | "required"
  | "local"
  | "ambient"
  | "util"
  | "performance"
  | "extra"
  | "disabled";

export type ModListAction = {
  key: string;
  label: string;
  title?: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
};

export type ModListItem = {
  key: string;
  name: string;
  tags: ModTag[];
  status?: "installed" | "missing";
  subtitle?: string;
  actions?: ModListAction[];
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
          {item.actions?.length ? (
            <div className="mod-actions">
              {item.actions.map((action) => (
                <button
                  key={`${item.key}-${action.key}`}
                  type="button"
                  className={`mod-action-button ${
                    action.tone === "danger" ? "mod-action-button-danger" : ""
                  }`}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  title={action.title}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </>
  );
}
