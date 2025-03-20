import { serve } from "std/http/server.ts";
import { serveDir } from "std/http/file_server.ts";

// 查找可用端口的函数
async function findAvailablePort(startPort: number): Promise<number> {
  let port = startPort;
  const maxPort = startPort + 100; // 最多尝试100个端口
  
  while (port < maxPort) {
    try {
      // 尝试创建一个临时服务器来测试端口是否可用
      const tempServer = Deno.listen({ port });
      // 如果成功创建，关闭它并返回这个可用端口
      tempServer.close();
      return port;
    } catch (err) {
      // 如果端口被占用，尝试下一个端口
      if (err instanceof Deno.errors.AddrInUse) {
        console.log(`端口 ${port} 已被占用，尝试下一个端口...`);
        port++;
      } else {
        // 如果是其他错误，抛出异常
        throw err;
      }
    }
  }
  
  throw new Error(`无法在端口范围 ${startPort}-${maxPort} 内找到可用端口`);
}

// 获取命令行参数中指定的端口，或使用环境变量，或使用默认值8000
const requestedPort = parseInt(Deno.args[0] || Deno.env.get("PORT") || "8000");

// 查找可用端口
const PORT = await findAvailablePort(requestedPort);

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