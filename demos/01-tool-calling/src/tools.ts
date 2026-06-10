/**
 * Demo 01 工具定义
 *
 * 每个工具 = 两个部分：
 *   1. Schema（工具说明书）：告诉模型这个工具叫什么、能做什么、需要什么参数
 *   2. 实现函数：真正执行逻辑的代码
 */

// ============================================================
// 工具 1：计算器
// ============================================================
export const calculatorSchema = {
  type: "function" as const,
  function: {
    name: "calculator",
    description:
      "计算一个数学表达式的结果。支持 + - * / 和括号。例如：'3 + 5 * 2'",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "要计算的数学表达式，如 '3 + 5 * 2'",
        },
      },
      required: ["expression"],
    },
  },
};

export function calculator(expression: string): string {
  try {
    const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, "");
    const result = eval(sanitized);
    return `${expression} = ${result}`;
  } catch {
    return `无法计算：${expression}`;
  }
}

// ============================================================
// 工具 2：获取当前时间
// ============================================================
export const getCurrentTimeSchema = {
  type: "function" as const,
  function: {
    name: "getCurrentTime",
    description: "获取当前日期和时间",
    parameters: {
      type: "object",
      properties: {
        timezone: {
          type: "string",
          description: "时区，如 'Asia/Shanghai'，默认为本地时区",
        },
      },
    },
  },
};

export function getCurrentTime(_timezone?: string): string {
  const now = new Date();
  return `当前时间：${now.toLocaleString("zh-CN", {
    timeZone: _timezone || "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "long",
  })}`;
}

// ============================================================
// 工具 3：查询天气（模拟数据）
// ============================================================
export const getWeatherSchema = {
  type: "function" as const,
  function: {
    name: "getWeather",
    description: "查询指定城市的天气情况（模拟数据）",
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "城市名称，如 '北京'、'上海'",
        },
      },
      required: ["city"],
    },
  },
};

export function getWeather(city: string): string {
  // 模拟天气数据，真实项目中应调用天气 API
  const weatherData: Record<string, string> = {
    北京: "晴，25°C，湿度 40%，风力 2 级",
    上海: "多云，28°C，湿度 65%，风力 3 级",
    深圳: "阵雨，30°C，湿度 80%，风力 4 级",
    杭州: "阴，22°C，湿度 55%，风力 2 级",
    成都: "小雨，20°C，湿度 75%，风力 1 级",
  };

  const weather =
    weatherData[city] ??
    `${city}：晴转多云，23°C，湿度 50%，风力 2 级（默认数据）`;
  return `城市：${city}\n天气：${weather}`;
}

// ============================================================
// 工具注册表：把所有工具汇集在一起，方便统一调用
// ============================================================
export const toolRegistry: Record<
  string,
  (args: Record<string, unknown>) => string
> = {
  calculator: (args) => calculator(args.expression as string),
  getCurrentTime: (args) => getCurrentTime(args.timezone as string),
  getWeather: (args) => getWeather(args.city as string),
};

// 所有工具的 schema 列表（发送给模型）
export const toolSchemas = [
  calculatorSchema,
  getCurrentTimeSchema,
  getWeatherSchema,
];
