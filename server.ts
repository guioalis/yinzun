import { serve } from "std/http/server.ts";
import { serveDir } from "std/http/file_server.ts";

const PORT = parseInt(Deno.env.get("PORT") || "8000");

console.log(`实时音准监控应用服务器启动在: http://localhost:${PORT}`);

await serve(async (req) => {
  const url = new URL(req.url);
  
  // 提供静态文件服务
  return await serveDir(req, {
    fsRoot: ".",
    urlRoot: "",
    showDirListing: true,
    enableCors: true,
  });
}, { port: PORT });