import { Dropbox } from "dropbox";
import "dotenv/config";

const dbx = new Dropbox({ accessToken: process.env.ACCESS_TOKEN });

export async function listFolder() {
  const res = await dbx.filesListFolder({
    path: "/server mods aug2023",
  });

  for (const entry of res.result.entries) {
    console.log(entry.name, entry[".tag"]);
  }
}
