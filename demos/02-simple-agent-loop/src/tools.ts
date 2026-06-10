/**
 * Demo 02 工具定义（与 Demo 01 相同，但工具注册表结构略有调整）
 */

// ============================================================
// 工具 Schema（发送给模型的"说明书"）
// ============================================================
export const toolSchemas = [
  {
    type: "function" as const,
    function: {
      name: "calculator",
      description: "计算数学表达式，支持 + - * / 和括号。如 '3 + 5 * 2'",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string", description: "数学表达式" },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getCurrentTime",
      description: "获取当前日期和时间",
      parameters: {
        type: "object",
        properties: {
          timezone: { type: "string", description: "时区，如 Asia/Shanghai" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "getWeather",
      description: "查询指定城市的天气（模拟数据）",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "城市名称" },
        },
        required: ["city"],
      },
    },
  },
];

// ============================================================
// 工具执行函数
// ============================================================
export function executeTool(
  name: string,
  args: Record<string, unknown>,
): string {
  switch (name) {
    case "calculator": {
      const expr = String(args.expression ?? "");
      try {
        const sanitized = expr.replace(/[^0-9+\-*/().%\s]/g, "");
        return `${expr} = ${eval(sanitized)}`;
      } catch {
        return `无法计算：${expr}`;
      }
    }

    case "getCurrentTime": {
      const tz = String(args.timezone || "Asia/Shanghai");
      return new Date().toLocaleString("zh-CN", {
        timeZone: tz,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        weekday: "long",
      });
    }

    case "getWeather": {
      const city = String(args.city ?? "北京");
      const data: Record<string, string> = {
        北京: "晴，25°C，湿度 40%，风力 2 级",
        上海: "多云，28°C，湿度 65%，风力 3 级",
        深圳: "阵雨，30°C，湿度 80%，风力 4 级",
      };
      return `${city}：${data[city] ?? "晴转多云，23°C"}`;
    }

    default:
      return `未知工具：${name}`;
  }
}
