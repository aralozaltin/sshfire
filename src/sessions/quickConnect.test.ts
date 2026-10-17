import { parseTarget } from "./quickConnect";

test.each([
  ["deploy@10.0.0.5", { user: "deploy", host: "10.0.0.5", port: 22 }],
  ["deploy@10.0.0.5:2222", { user: "deploy", host: "10.0.0.5", port: 2222 }],
  ["  root@example.com  ", { user: "root", host: "example.com", port: 22 }],
  ["ssh deploy@host.local", { user: "deploy", host: "host.local", port: 22 }],
  ["ssh -p 2200 deploy@host.local", { user: "deploy", host: "host.local", port: 2200 }],
  ["deploy@[::1]:2201", { user: "deploy", host: "::1", port: 2201 }],
  ["deploy@[fe80::1]", { user: "deploy", host: "fe80::1", port: 22 }],
  ["first.last@corp.example.com", { user: "first.last", host: "corp.example.com", port: 22 }],
])("%s parses", (input, expected) => {
  expect(parseTarget(input)).toEqual(expected);
});

test.each(["", "   ", "host-only", "@host", "user@", "user@host:0", "user@host:70000", "user@host:abc", "user@ho st", "a@b@c"])(
  "%j is rejected",
  (input) => {
    expect(parseTarget(input)).toBeNull();
  },
);
