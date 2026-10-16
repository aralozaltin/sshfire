export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  isSymlink: boolean;
  size: number;
  modified: number | null;
  permissions: number | null;
  owner: string | null;
  group: string | null;
}

import type { TransferEvent } from "./transfers";

export interface FilesApi {
  sftpHome(tabId: string): Promise<string>;
  sftpList(tabId: string, path: string): Promise<FileEntry[]>;
  sftpMkdir(tabId: string, path: string): Promise<void>;
  sftpRename(tabId: string, from: string, to: string): Promise<void>;
  sftpRemove(tabId: string, path: string, recursive: boolean): Promise<void>;
  sftpChmod(tabId: string, path: string, mode: number): Promise<void>;
  sftpCopy(tabId: string, from: string, to: string): Promise<void>;
  sftpReadText(tabId: string, path: string): Promise<string>;
  sftpWriteText(tabId: string, path: string, content: string): Promise<void>;
  sftpUpload(tabId: string, items: { local: string; remote: string }[]): Promise<string[]>;
  sftpDownload(tabId: string, remotePaths: string[]): Promise<string[]>;
  pickFiles(): Promise<string[]>;
  onFilesDropped(cb: (paths: string[]) => void): Promise<() => void>;
  onTransferProgress(cb: (e: TransferEvent) => void): Promise<() => void>;
}
