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

export interface FilesApi {
  sftpHome(tabId: string): Promise<string>;
  sftpList(tabId: string, path: string): Promise<FileEntry[]>;
  sftpMkdir(tabId: string, path: string): Promise<void>;
  sftpRename(tabId: string, from: string, to: string): Promise<void>;
  sftpRemove(tabId: string, path: string, recursive: boolean): Promise<void>;
  sftpCopy(tabId: string, from: string, to: string): Promise<void>;
}
