import "./ProgressBar.css";

export type ForgeInstallProgress = {
  stage: "searching" | "downloading" | "installing" | "done" | "error";
  percent: number;
  message: string;
};

type ForgeInstallerProps = {
  progress: ForgeInstallProgress;
};

export default function ForgeInstaller({ progress }: ForgeInstallerProps) {
  return (
    <div className="forge-progress">
      <div className="forge-progress-track">
        <div
          className="forge-progress-fill"
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      <div className="forge-progress-message">{progress.message || "Idle"}</div>
    </div>
  );
}
