let appHandler: any = null;

async function getApp() {
  if (!appHandler) {
    try {
      // Try loading pre-compiled server distribution
      const serverModule = await import("../server/dist/index.js");
      appHandler = serverModule.default || serverModule.app;
    } catch {
      // Fallback to TypeScript source
      const serverModule = await import("../server/src/index.js");
      appHandler = serverModule.default || serverModule.app;
    }
  }
  return appHandler;
}

export default async function handler(req: any, res: any) {
  const app = await getApp();
  return app(req, res);
}
