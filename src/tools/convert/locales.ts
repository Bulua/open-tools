import { defineModuleLocales } from "@/locales/types";

/** 转换模块的多语言文案，写法见 docs/DEVELOPMENT.md「多语言文案」 */
export default defineModuleLocales({
  tools: {
    units: { name: "Unit Converter", desc: "Convert temperature, length, weight, area, volume, data, speed, time, pressure, energy, power, angle and frequency" },
    timestamp: { name: "Timestamp Converter", desc: "Convert Unix timestamps (seconds / milliseconds) to and from dates, and see the current timestamp" },
    timezone: { name: "Time Zones / World Clock", desc: "Convert times between any time zones and view the current time in several cities side by side over 24 hours" },
    radix: { name: "Number Base Converter", desc: "Convert between binary, octal, decimal, hexadecimal and any other base" },
    color: { name: "Color Converter HEX/RGB/HSL", desc: "Convert between color formats, with a color picker" },
    naming: { name: "Naming Case Converter", desc: "Convert identifiers between camelCase, snake_case, kebab-case, CONSTANT_CASE and more" },
  },
});
