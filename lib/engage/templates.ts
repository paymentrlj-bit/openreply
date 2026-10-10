import type { Language } from "./types";

/**
 * Fixed replies used when the model's reply fails the safety checks, and for
 * emoji-only comments and DMs, where no model call is needed. Each language
 * has several variants so replies do not repeat word for word.
 *
 * Marathi and Hindi wording here should be read once by a native speaker.
 */

export type TemplateKind =
  | "thanks"
  | "question_price"
  | "question_location"
  | "question_other"
  | "complaint_dm";

const T: Record<TemplateKind, Record<Exclude<Language, "other">, string[]>> = {
  thanks: {
    en: ["Thank you so much! 🙏💛", "Thank you! 🙏✨", "We really appreciate it! 💛"],
    mr: ["धन्यवाद! 🙏💛", "मनापासून आभार! 🙏", "खूप खूप धन्यवाद 🙏✨"],
    mr_latn: ["Dhanyawad! 🙏💛", "Manapasun aabhar! 🙏", "Khup khup dhanyawad 🙏✨"],
    hi: ["धन्यवाद! 🙏💛", "बहुत बहुत शुक्रिया 🙏", "दिल से आभार 🙏✨"],
    hi_latn: ["Shukriya! 🙏💛", "Bahut bahut dhanyawad 🙏", "Dil se shukriya 🙏✨"],
  },
  question_price: {
    en: ["Comment RATE and we'll send you today's rate details 📲"],
    mr: ["आजचे भाव पाहण्यासाठी RATE असे कमेंट करा 📲"],
    mr_latn: ["Aajche bhav pahnyasathi RATE ase comment kara 📲"],
    hi: ["आज के भाव जानने के लिए RATE कमेंट करें 📲"],
    hi_latn: ["Aaj ke bhav jaanne ke liye RATE comment karein 📲"],
  },
  question_location: {
    en: ["Comment LOCATION and we'll send you our address 📍"],
    mr: ["आमचा पत्ता मिळवण्यासाठी LOCATION असे कमेंट करा 📍"],
    mr_latn: ["Aamcha patta milvnyasathi LOCATION ase comment kara 📍"],
    hi: ["हमारा पता पाने के लिए LOCATION कमेंट करें 📍"],
    hi_latn: ["Hamara pata paane ke liye LOCATION comment karein 📍"],
  },
  question_other: {
    en: ["Please send us a DM and our team will be happy to help 🙏"],
    mr: ["कृपया आम्हाला DM करा, आमची टीम नक्की मदत करेल 🙏"],
    mr_latn: ["Krupaya aamhala DM kara, aamchi team nakki madat karel 🙏"],
    hi: ["कृपया हमें DM करें, हमारी टीम ज़रूर मदद करेगी 🙏"],
    hi_latn: ["Kripya humein DM karein, hamari team zaroor madad karegi 🙏"],
  },
  complaint_dm: {
    en: [
      "Hello, thank you for telling us. 🙏 We're sorry your experience wasn't what we hoped for. Could you please share what happened so we can make it right? Our owner will look into it personally.",
    ],
    mr: [
      "नमस्कार, आम्हाला कळवल्याबद्दल धन्यवाद. 🙏 तुमचा अनुभव अपेक्षेप्रमाणे नव्हता याबद्दल आम्हाला खेद आहे. नेमकं काय झालं ते कृपया सांगाल का? म्हणजे आम्ही ते सुधारू शकू. आमचे मालक स्वतः लक्ष घालतील.",
    ],
    mr_latn: [
      "Namaskar, aamhala kalavlyabaddal dhanyawad. 🙏 Tumcha anubhav apekshepramane navhta yabaddal aamhala khed aahe. Nemka kay zhala te krupaya sangal ka? Mhanje aamhi te sudharu shakoo. Aamche malak swatah laksha ghaltil.",
    ],
    hi: [
      "नमस्कार, हमें बताने के लिए धन्यवाद। 🙏 आपका अनुभव अपेक्षा के अनुसार नहीं रहा, इसका हमें खेद है। कृपया बताएँ कि क्या हुआ ताकि हम उसे सुधार सकें। हमारे मालिक स्वयं इसे देखेंगे।",
    ],
    hi_latn: [
      "Namaskar, humein batane ke liye dhanyawad. 🙏 Aapka anubhav apeksha ke anusar nahi raha, iska humein khed hai. Kripya bataiye kya hua taaki hum use sudhaar saken. Hamare malik khud ise dekhenge.",
    ],
  },
};

/** A small, stable hash so the same target always picks the same variant. */
export function seedIndex(seed: string, length: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % Math.max(1, length);
}

export function pickTemplate(
  kind: TemplateKind,
  language: Language,
  seed: string
): string {
  const variants = T[kind][language === "other" ? "en" : language];
  return variants[seedIndex(seed, variants.length)];
}

/** Replies to emoji-only messages: short and language-neutral. */
export function pickReactionReply(seed: string): string {
  const variants = [
    "Thank you! 🙏💛",
    "धन्यवाद! 🙏💛",
    "Thank you so much! 🙏✨",
    "Dhanyawad! 🙏💛",
  ];
  return variants[seedIndex(seed, variants.length)];
}
