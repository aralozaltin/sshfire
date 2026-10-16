import { languageId, loadLanguage } from "./languages";

test.each([
  ["/etc/nginx/nginx.conf", "nginx"],
  ["/etc/nginx/sites-enabled/app", "nginx"],
  ["/srv/app/config.json", "json"],
  ["/srv/docker-compose.yml", "yaml"],
  ["/srv/values.YAML", "yaml"],
  ["/home/u/deploy.sh", "shell"],
  ["/home/u/.bashrc", "shell"],
  ["/home/u/.zshrc", "shell"],
  ["/srv/Dockerfile", "dockerfile"],
  ["/srv/tool.py", "python"],
  ["/srv/app.ts", "javascript"],
  ["/srv/app.tsx", "javascript"],
  ["/srv/app.mjs", "javascript"],
  ["/srv/README.md", "markdown"],
  ["/srv/index.html", "html"],
  ["/srv/site.css", "css"],
  ["/srv/pom.xml", "xml"],
  ["/srv/dump.sql", "sql"],
  ["/srv/app.properties", "properties"],
  ["/srv/.env", "properties"],
  ["/etc/app/settings.ini", "properties"],
  ["/srv/Cargo.toml", "toml"],
  ["/srv/changes.diff", "diff"],
])("%s is recognised as %s", (path, id) => {
  expect(languageId(path)).toBe(id);
});

test.each(["/var/log/syslog", "/srv/app.log", "/srv/data.bin", "/srv/noextension"])("%s has no language", (path) => {
  expect(languageId(path)).toBeNull();
});

test("every recognised language can be loaded", async () => {
  for (const id of ["nginx", "json", "yaml", "shell", "dockerfile", "python", "javascript", "markdown", "html", "css", "xml", "sql", "properties", "toml", "diff"]) {
    expect(await loadLanguage(id), id).toBeTruthy();
  }
});
