// Reads the three data files on the server and works out the diary's numbers. Server components only.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { diaryNumbers, type DataFiles, type DiaryNumbers } from "./numbers";

const DATA = join(process.cwd(), "public", "data");
const read = async <T,>(f: string) => JSON.parse(await readFile(join(DATA, f), "utf-8")) as T;

export async function readDiaryNumbers(): Promise<DiaryNumbers> {
  const [delta, method, findings] = await Promise.all([
    read<DataFiles["delta"]>("areas/nile-delta.json"),
    read<DataFiles["method"]>("method.json"),
    read<DataFiles["findings"]>("findings.json"),
  ]);
  return diaryNumbers({ delta, method, findings });
}
