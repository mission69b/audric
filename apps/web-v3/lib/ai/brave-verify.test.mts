import { braveImageSearch, isBraveConfigured } from "@/lib/ai/brave";
console.log("configured:", isBraveConfigured());
const imgs = await braveImageSearch("sydney opera house", 4);
console.log("results:", imgs.length, imgs[0]?.url?.slice(0, 60));
