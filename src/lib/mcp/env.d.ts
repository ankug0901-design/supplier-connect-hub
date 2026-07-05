// Tool files are bundled into a Deno Edge Function, where `process.env` is
// polyfilled by Deno's Node compat. Declare it here so the app's TS build
// (which imports these files transitively via the plugin's manifest extract)
// doesn't fail.
declare const process: { env: Record<string, string | undefined> };
