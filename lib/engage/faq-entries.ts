/**
 * Answers written by the shop owner. Each entry is used when a comment or
 * message contains any of the keywords. The reply is sent exactly as written,
 * so numbers and timings are allowed here, unlike replies written by the AI
 * model.
 *
 * Matching: Latin keywords must match whole words or phrases (case does not
 * matter, punctuation is ignored). Devanagari keywords match anywhere in the
 * text, so they work with endings such as "वेळेत". The first entry that
 * matches wins, so more specific entries come first.
 *
 * `yieldsToRate`: if the person is asking about a rate or price, answer with
 * the rate invitation instead of this entry.
 *
 * Keep replies short. English is used when a language is missing.
 */

export interface FaqEntry {
  id: string;
  keywords: string[];
  replies: Partial<Record<"en" | "mr" | "mr_latn" | "hi" | "hi_latn", string>>;
  yieldsToRate?: boolean;
}

export const CUSTOM_FAQ: FaqEntry[] = [
  {
    id: "old-gold",
    keywords: [
      "old gold", "buyback", "buy back", "sell gold", "sell my gold", "gold exchange",
      "juna sona", "jun sone", "purana sona",
      "जुने सोने", "जुन्या सोन्या", "पुराना सोना", "पुराने सोने",
    ],
    replies: {
      en: "Yes! We give full value on your old gold when you exchange it, and we buy back old gold at the best market rate 🙏",
      mr: "हो! जुन्या सोन्याच्या एक्सचेंजवर आम्ही पूर्ण मूल्य देतो आणि जुने सोने सर्वोत्तम बाजारभावाने खरेदी करतो 🙏",
      mr_latn: "Ho! Junya sonyachya exchange var aamhi purna mulya deto ani june sone sarvottam bajarbhavane kharedi karto 🙏",
      hi: "जी हाँ! पुराने सोने के एक्सचेंज पर हम पूरी वैल्यू देते हैं और पुराना सोना बेस्ट मार्केट रेट पर खरीदते हैं 🙏",
      hi_latn: "Ji haan! Purane sone ke exchange par hum poori value dete hain aur purana sona best market rate par kharidte hain 🙏",
    },
  },
  {
    id: "schemes",
    keywords: [
      "scheme", "schemes", "yojana", "yojna", "savings plan", "saving plan", "gold plan",
      "sip", "monthly plan", "instalment", "installment", "bachat", "making off", "free making",
      "बचत", "योजना", "स्कीम", "हप्ता", "हप्ते", "किस्त",
    ],
    replies: {
      en: "We have 3 gold savings schemes: Suvarna Vrudhi Yojana (11+1: pay 11 instalments and the 12th is on us), Sona Muft Shulk Plan (100% making discount) and Sona Suraksha Plan (monthly rate booking). Message us on WhatsApp for details: 9850501854 🙏",
      mr: "आमच्याकडे ३ सोन्याच्या बचत योजना आहेत: सुवर्ण वृद्धी योजना (११+१: ११ हप्ते भरा, १२वा हप्ता आमच्याकडून), सोना मुक्त शुल्क प्लॅन (मेकिंगवर १००% सूट) आणि सोना सुरक्षा प्लॅन (दरमहा रेट बुकिंग). अधिक माहितीसाठी WhatsApp करा: 9850501854 🙏",
      mr_latn: "Aamchyakade 3 sonyachya bachat yojana aahet: Suvarna Vrudhi Yojana (11+1: 11 hapte bhara, 12va hapta aamchyakadun), Sona Muft Shulk Plan (making var 100% soot) ani Sona Suraksha Plan (dar mahinyala rate booking). Adhik mahitisathi WhatsApp kara: 9850501854 🙏",
      hi: "हमारे पास 3 गोल्ड सेविंग स्कीम हैं: सुवर्ण वृद्धि योजना (11+1: 11 किस्तें भरें, 12वीं किस्त हमारी तरफ़ से), सोना मुक्त शुल्क प्लान (मेकिंग पर 100% छूट) और सोना सुरक्षा प्लान (हर महीने रेट बुकिंग)। अधिक जानकारी के लिए WhatsApp करें: 9850501854 🙏",
      hi_latn: "Hamare paas 3 gold savings scheme hain: Suvarna Vrudhi Yojana (11+1: 11 kisht bharein, 12vi kisht hamari taraf se), Sona Muft Shulk Plan (making par 100% chhoot) aur Sona Suraksha Plan (har mahine rate booking). Adhik jaankari ke liye WhatsApp karein: 9850501854 🙏",
    },
  },
  {
    id: "making-charges",
    keywords: [
      "making charges", "making charge", "making cost", "making",
      "मेकिंग", "घडणावळ", "मजुरी",
    ],
    replies: {
      en: "Making charges depend on the design and start from 5.99%. Please visit us and our team will guide you 🙏",
      mr: "मेकिंग चार्जेस डिझाइननुसार असतात आणि ५.९९% पासून सुरू होतात. कृपया दुकानाला भेट द्या, आमची टीम तुम्हाला मार्गदर्शन करेल 🙏",
      mr_latn: "Making charges designnusar astat ani 5.99% pasun suru hotat. Krupaya dukanala bhet dya, aamchi team tumhala margdarshan karel 🙏",
      hi: "मेकिंग चार्ज डिज़ाइन के अनुसार होते हैं और 5.99% से शुरू होते हैं। कृपया हमारे स्टोर पर आएँ, हमारी टीम आपका मार्गदर्शन करेगी 🙏",
      hi_latn: "Making charges design ke hisaab se hote hain aur 5.99% se shuru hote hain. Kripya hamare store par aayein, hamari team aapka margdarshan karegi 🙏",
    },
  },
  {
    id: "timings",
    keywords: [
      "timing", "timings", "opening time", "closing time", "open today", "open on", "open till",
      "kitne baje", "kab khulta", "kab tak khula", "kadhi ughdta", "kiti vajta", "working hours",
      "store hours", "shop hours",
      "वेळ", "किती वाजता", "उघडे", "समय", "कितने बजे",
    ],
    replies: {
      en: "Our stores are open daily 10 am–9 pm (Pachora 10 am–8 pm). Nashik closes at 2 pm on Tuesdays and Thane opens at 2 pm on Mondays. We're open on festival days too 🙏",
      mr: "आमची दुकाने रोज सकाळी १० ते रात्री ९ उघडी असतात (पाचोरा: सकाळी १० ते रात्री ८). नाशिक मंगळवारी दुपारी २ वाजता बंद होते आणि ठाणे सोमवारी दुपारी २ वाजता उघडते. सणांच्या दिवशीही आम्ही सुरू असतो 🙏",
      mr_latn: "Aamchi dukane roj sakali 10 te ratri 9 paryant ughdi astat (Pachora: sakali 10 te ratri 8). Nashik mangalvari dupari 2 vajta band hote ani Thane somvari dupari 2 vajta ughdte. Sananchya divshihi aamhi suru astoo 🙏",
      hi: "हमारे स्टोर रोज़ सुबह 10 से रात 9 बजे तक खुले रहते हैं (पाचोरा: सुबह 10 से रात 8 बजे)। नाशिक मंगलवार को दोपहर 2 बजे बंद होता है और ठाणे सोमवार को दोपहर 2 बजे खुलता है। त्योहारों पर भी हम खुले रहते हैं 🙏",
      hi_latn: "Hamare stores roz subah 10 se raat 9 baje tak khule rehte hain (Pachora: subah 10 se raat 8 baje). Nashik mangalvar ko dopahar 2 baje band hota hai aur Thane somvar ko dopahar 2 baje khulta hai. Tyohar par bhi hum khule rehte hain 🙏",
    },
  },
  {
    id: "hallmark",
    keywords: [
      "hallmark", "hallmarked", "bis", "huid", "916", "purity", "certified", "certificate",
      "हॉलमार्क", "शुद्धता", "शुद्धत",
    ],
    replies: {
      en: "Yes, all our gold and diamond jewellery is BIS hallmarked 🙏",
      mr: "हो, आमचे सर्व सोन्याचे आणि हिऱ्यांचे दागिने BIS हॉलमार्क असलेले आहेत 🙏",
      mr_latn: "Ho, aamche sarva sonyache ani hirayanche dagine BIS hallmark asleale aahet 🙏",
      hi: "जी हाँ, हमारे सभी सोने और हीरे के गहने BIS हॉलमार्क वाले हैं 🙏",
      hi_latn: "Ji haan, hamare sabhi sone aur heere ke gahne BIS hallmarked hain 🙏",
    },
  },
  {
    id: "custom-bridal",
    keywords: [
      "custom", "customised", "customized", "bridal", "bride", "made to order",
      "ब्रायडल", "कस्टम", "बनवून", "बनवायचे", "नववधू",
    ],
    replies: {
      en: "Yes, we take custom and bridal orders. They take about 5 to 30 days depending on the design, with 100% advance payment. You can send us a photo or design on WhatsApp: 9850501854 🙏",
      mr: "हो, आम्ही कस्टम आणि ब्रायडल ऑर्डर घेतो. डिझाइननुसार साधारण ५ ते ३० दिवस लागतात आणि १००% अ‍ॅडव्हान्स द्यावा लागतो. तुमचा फोटो किंवा डिझाइन WhatsApp वर पाठवा: 9850501854 🙏",
      mr_latn: "Ho, aamhi custom ani bridal order gheto. Designnusar sadharan 5 te 30 divas lagtat ani 100% advance dyava lagto. Tumcha photo kiva design WhatsApp var pathva: 9850501854 🙏",
      hi: "जी हाँ, हम कस्टम और ब्राइडल ऑर्डर लेते हैं। डिज़ाइन के अनुसार लगभग 5 से 30 दिन लगते हैं और 100% एडवांस पेमेंट लगता है। आप अपनी फोटो या डिज़ाइन WhatsApp पर भेज सकते हैं: 9850501854 🙏",
      hi_latn: "Ji haan, hum custom aur bridal order lete hain. Design ke hisaab se lagbhag 5 se 30 din lagte hain aur 100% advance payment lagta hai. Aap apni photo ya design WhatsApp par bhej sakte hain: 9850501854 🙏",
    },
  },
  {
    id: "delivery",
    keywords: [
      "delivery", "deliver", "ship", "shipping", "courier", "home delivery", "parcel",
      "डिलिव्हरी", "डिलिवरी", "कुरिअर", "घरपोच",
    ],
    replies: {
      en: "Yes, we deliver all over India. Delivery is at actual cost and includes insurance 🙏",
      mr: "हो, आम्ही संपूर्ण भारतात डिलिव्हरी करतो. डिलिव्हरी खर्च प्रत्यक्ष खर्चानुसार असतो आणि त्यात विमा समाविष्ट आहे 🙏",
      mr_latn: "Ho, aamhi sampurna Bharatat delivery karto. Delivery kharch pratyaksh kharchanusar asto ani tyat vima samavisht aahe 🙏",
      hi: "जी हाँ, हम पूरे भारत में डिलीवरी करते हैं। डिलीवरी का खर्च वास्तविक लागत के अनुसार होता है और उसमें बीमा शामिल है 🙏",
      hi_latn: "Ji haan, hum poore Bharat mein delivery karte hain. Delivery ka kharch actual cost ke hisaab se hota hai aur usmein insurance shamil hai 🙏",
    },
  },
  {
    id: "payments",
    keywords: [
      "upi", "gpay", "phonepe", "paytm", "card", "cards", "credit card", "debit card",
      "net banking", "netbanking", "emi", "payment", "accept cash",
      "पेमेंट", "कार्ड", "ईएमआय",
    ],
    replies: {
      en: "We accept UPI, cards and net banking 🙏",
      mr: "आम्ही UPI, कार्ड आणि नेट बँकिंग स्वीकारतो 🙏",
      mr_latn: "Aamhi UPI, card ani net banking swikarto 🙏",
      hi: "हम UPI, कार्ड और नेट बैंकिंग स्वीकार करते हैं 🙏",
      hi_latn: "Hum UPI, card aur net banking swikar karte hain 🙏",
    },
  },
  {
    id: "exchange-returns",
    keywords: [
      "exchange", "return", "returns", "refund", "return policy", "exchange policy",
      "बदलून", "एक्सचेंज", "रिफंड", "परत", "वापस",
    ],
    replies: {
      en: "No refunds, but you can exchange within 100 days with the tag intact and pay only the difference if the weight is higher. After 100 days we offer lifetime exchange on all our jewellery 🙏",
      mr: "रिफंड नाही, पण टॅग तसाच असल्यास १०० दिवसांत दागिना बदलून घेता येतो; वजन जास्त असल्यास फक्त फरक भरावा लागतो. १०० दिवसांनंतर आमच्या सर्व दागिन्यांवर आजीवन एक्सचेंज मिळतो 🙏",
      mr_latn: "Refund nahi, pan tag tasach asel tar 100 divsat dagina badalun gheta yeto; vajan jast asel tar fakt farak bharava lagto. 100 divsanantar aamchya sarva daginyanvar aajivan exchange milto 🙏",
      hi: "रिफंड नहीं है, लेकिन टैग सही सलामत हो तो 100 दिनों में गहना बदल सकते हैं; वज़न ज़्यादा हो तो सिर्फ़ फ़र्क़ देना होगा। 100 दिनों के बाद हमारे सभी गहनों पर लाइफ़टाइम एक्सचेंज मिलता है 🙏",
      hi_latn: "Refund nahi hai, lekin tag salamat ho to 100 din mein gehna badal sakte hain; vazan zyada ho to sirf fark dena hoga. 100 din ke baad hamare sabhi gehnon par lifetime exchange milta hai 🙏",
    },
  },
  {
    id: "products",
    yieldsToRate: true,
    keywords: [
      "coin", "coins", "bar", "bars", "silver", "diamond", "diamonds", "platinum", "chandi", "hira",
      "नाणी", "नाणे", "चांदी", "हिरे", "हिऱ्या",
    ],
    replies: {
      en: "We have gold jewellery in 18kt, 22kt and 24kt, plus gold coins and bars, silver and diamond jewellery 🙏",
      mr: "आमच्याकडे १८, २२ आणि २४ कॅरेट सोन्याचे दागिने, सोन्याची नाणी आणि बार, तसेच चांदी आणि हिऱ्यांचे दागिने उपलब्ध आहेत 🙏",
      mr_latn: "Aamchyakade 18, 22 ani 24 carat sonyache dagine, sonyachi nane ani bar, tasech chandi ani hirayanche dagine upalabdh aahet 🙏",
      hi: "हमारे पास 18, 22 और 24 कैरेट सोने के गहने, सोने के सिक्के और बार, साथ ही चांदी और हीरे के गहने उपलब्ध हैं 🙏",
      hi_latn: "Hamare paas 18, 22 aur 24 carat sone ke gehne, sone ke sikke aur bar, saath hi chandi aur heere ke gehne uplabdh hain 🙏",
    },
  },
  {
    id: "repairs",
    keywords: [
      "repair", "repairs", "polish", "polishing", "resize", "resizing", "alteration",
      "दुरुस्ती", "पॉलिश", "रिपेअर",
    ],
    replies: {
      en: "Yes, we repair, polish and resize jewellery 🙏",
      mr: "हो, आम्ही दागिन्यांची दुरुस्ती, पॉलिश आणि साइज बदलून देतो 🙏",
      mr_latn: "Ho, aamhi daginyanchi durusti, polish ani size badalun deto 🙏",
      hi: "जी हाँ, हम गहनों की मरम्मत, पॉलिश और साइज़ बदलने का काम करते हैं 🙏",
      hi_latn: "Ji haan, hum gehnon ki repair, polish aur size badalne ka kaam karte hain 🙏",
    },
  },
  {
    id: "appointments",
    keywords: [
      "appointment", "appointments", "book a visit", "book visit", "walk in",
      "अपॉइंटमेंट",
    ],
    replies: {
      en: "No appointment needed, just walk in any time during store hours 🙏",
      mr: "अपॉइंटमेंटची गरज नाही, दुकानाच्या वेळेत कधीही या 🙏",
      mr_latn: "Appointment chi garaj nahi, dukanachya velet kadhihi ya 🙏",
      hi: "अपॉइंटमेंट की ज़रूरत नहीं है, स्टोर के समय में कभी भी आइए 🙏",
      hi_latn: "Appointment ki zaroorat nahi hai, store ke samay mein kabhi bhi aaiye 🙏",
    },
  },
  {
    id: "contact",
    yieldsToRate: true,
    keywords: [
      "whatsapp", "contact", "contact number", "phone number", "mobile number", "your number",
      "call you", "नंबर", "संपर्क", "फोन",
    ],
    replies: {
      en: "You can reach us on WhatsApp or call 9850501854 🙏",
      mr: "तुम्ही आम्हाला WhatsApp किंवा कॉल करू शकता: 9850501854 🙏",
      mr_latn: "Tumhi aamhala WhatsApp kiva call karu shakta: 9850501854 🙏",
      hi: "आप हमें WhatsApp या कॉल कर सकते हैं: 9850501854 🙏",
      hi_latn: "Aap humein WhatsApp ya call kar sakte hain: 9850501854 🙏",
    },
  },
];
