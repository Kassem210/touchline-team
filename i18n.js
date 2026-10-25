/* Arabic for Touchline Team.
   The site is written in English. When Arabic is on, this file switches the page to right-to-left
   and swaps English text for Arabic as it appears on screen (it watches the page for changes).
   Arabic is on when: the link has ?lang=ar, the person picked it before, or their browser is set to Arabic.
   Load it in <head>, before the page's own scripts. */
(function () {
  "use strict";
  var KEY = "tl-lang";
  var store = { get: function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } }, set: function (v) { try { localStorage.setItem(KEY, v); } catch (e) {} } };
  var qs = null; try { qs = new URLSearchParams(location.search).get("lang"); } catch (e) {}
  if (qs === "ar" || qs === "en") store.set(qs);
  var lang = qs === "ar" || qs === "en" ? qs : store.get() || (/^ar/i.test(navigator.language || "") ? "ar" : "en");
  window.TL_LANG = lang;
  window.tlSetLang = function (l) {
    store.set(l);
    var u = new URL(location.href); u.searchParams.set("lang", l); location.href = u.toString();
  };

  /* ---------- language switch button (shown in both languages) ---------- */
  var BTN_CSS = ".tl-lang{font:600 14px/1 system-ui,sans-serif;border:1px solid var(--line,#D6DCE5);background:var(--surface,#fff);color:var(--ink,#131F34);border-radius:999px;padding:8px 12px;cursor:pointer;white-space:nowrap}" +
    ".tl-lang:hover{border-color:var(--accent,#2343C4)}" +
    ".tl-lang.float{position:fixed;top:max(10px,env(safe-area-inset-top,0px));inset-inline-end:12px;z-index:40;box-shadow:0 4px 14px rgba(0,0,0,.12)}" +
    "header.top .tl-lang{margin-inline-start:4px;flex:none}";
  function langBtn(cls) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "tl-lang" + (cls ? " " + cls : "");
    b.setAttribute("translate", "no");
    b.textContent = lang === "ar" ? "English" : "العربية";
    b.setAttribute("aria-label", lang === "ar" ? "Switch to English" : "التبديل إلى العربية");
    b.addEventListener("click", function () { window.tlSetLang(lang === "ar" ? "en" : "ar"); });
    return b;
  }
  function placeButton() {
    if (!document.body) return;
    var lp = document.querySelector(".lp-nav .act");
    if (lp) { if (!lp.querySelector(".tl-lang")) lp.insertBefore(langBtn(), lp.firstChild); return; }
    var head = document.querySelector("header.top");
    var fl = document.querySelector(".tl-lang.float");
    if (head) { if (fl) fl.remove(); if (!head.querySelector(".tl-lang")) head.appendChild(langBtn()); return; }
    if (!fl) document.body.appendChild(langBtn("float"));
  }
  var st = document.createElement("style"); st.textContent = BTN_CSS; document.head.appendChild(st);

  if (lang !== "ar") {
    var mo0 = new MutationObserver(placeButton);
    document.addEventListener("DOMContentLoaded", function () { placeButton(); mo0.observe(document.body, { childList: true, subtree: true }); });
    return;
  }

  /* ---------- Arabic: direction, font and layout ---------- */
  var html = document.documentElement;
  html.lang = "ar"; html.dir = "rtl";
  var font = document.createElement("link");
  font.rel = "stylesheet"; font.href = "https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap";
  document.head.appendChild(font);
  var css = document.createElement("style");
  css.textContent = [
    ":root{--f-display:'Barlow Condensed','Cairo','Arial Narrow',system-ui,sans-serif;--f-body:'Public Sans','Cairo',system-ui,-apple-system,'Segoe UI',sans-serif}",
    "html[lang=ar] body{font-family:var(--f-body)}",
    "html[lang=ar] *{letter-spacing:0!important}",
    "[dir=rtl] .whoami .t{text-align:right}",
    "[dir=rtl] .banner b{margin-right:0;margin-left:6px}",
    "[dir=rtl] .tabs .count{margin-left:0;margin-right:6px}",
    "[dir=rtl] .tile .v small{margin-left:0;margin-right:3px}",
    "[dir=rtl] .next::after{right:auto;left:-40px}",
    "[dir=rtl] .flag{border-left:0;border-right:4px solid var(--muted)}",
    "[dir=rtl] .ann{border-left:0;border-right:4px solid var(--line);padding:4px 14px 4px 0}",
    "[dir=rtl] .pick button,[dir=rtl] .club-list button{text-align:right}",
    "[dir=rtl] .ai-status.busy::before{margin-right:0;margin-left:8px}",
    "[dir=rtl] .legal ul,[dir=rtl] .legal ol{padding-left:0;padding-right:22px}",
    "[dir=rtl] .legal th,[dir=rtl] .legal td{text-align:right}",
    "[dir=rtl] [style*='margin-right:auto']{margin-right:0!important;margin-left:auto}",
    "[dir=rtl] .lp-nav nav{margin-left:0;margin-right:auto}",
    "@media (max-width:760px){[dir=rtl] .lp-nav .act{margin-left:0;margin-right:auto}}",
    "[dir=rtl] .flagm{border-left:0;border-right:4px solid var(--warn)}",
    "[dir=rtl] .float{right:auto;left:-14px}",
    "@media (max-width:900px){[dir=rtl] .float{left:8px}}",
    "@media (max-width:480px){[dir=rtl] .float{left:auto}}",
    "[dir=rtl] .plan-card ul{padding-left:0;padding-right:18px}",
    "[dir=rtl] .back{float:none}",
    "[dir=rtl] input[type=email],[dir=rtl] input[type=password],[dir=rtl] input[type=url]{direction:ltr;text-align:right}",
  ].join("\n");
  document.head.appendChild(css);

  // Dates in Arabic, keeping Western digits (as most Egyptian apps do)
  var LOC = "ar-EG-u-nu-latn";
  ["toLocaleDateString", "toLocaleString", "toLocaleTimeString"].forEach(function (fn) {
    var orig = Date.prototype[fn];
    Date.prototype[fn] = function (loc, opt) { return orig.call(this, loc === undefined ? LOC : loc, opt); };
  });
  var origNum = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (loc, opt) { return origNum.call(this, loc === undefined ? "en-US" : loc, opt); };

  /* ---------- exact text ---------- */
  var AR = {
    // general
    "Today": "اليوم", "Yesterday": "أمس", "Tomorrow": "غدًا", "Touchline Team logo": "شعار Touchline Team",
    "Football": "كرة القدم", "Basketball": "كرة السلة", "Tennis": "التنس", "Gymnastics": "الجمباز", "Other sport": "رياضة أخرى", "Any sport": "أي رياضة",
    "Match": "مباراة", "Game": "مباراة", "Meet": "بطولة", "Apps": "مشاركات", "Goals": "أهداف", "Assists": "تمريرات حاسمة", "Minutes": "دقائق",
    "Games": "مباريات", "Points": "نقاط", "Rebounds": "متابعات", "Matches": "مباريات", "Wins": "انتصارات", "Aces": "إرسالات ساحقة", "Sets won": "أشواط فائزة",
    "Meets": "بطولات", "Best score": "أفضل نتيجة", "Avg score": "متوسط النتيجة", "Medals": "ميداليات", "Personal bests": "أرقام شخصية",
    "Breakfast": "فطار", "Lunch": "غداء", "Dinner": "عشاء", "Snack": "وجبة خفيفة", "Pre-session": "قبل التمرين", "Recovery": "استشفاء",
    "Team training": "تمرين الفريق", "Gym": "جيم", "Run": "جري", "Skills": "مهارات", "Other": "أخرى",
    "Present": "حاضر", "Late": "متأخر", "Absent": "غائب", "Excused": "بعذر",
    "Calories": "السعرات", "Protein": "البروتين", "Carbs": "الكربوهيدرات", "Fat": "الدهون", "kcal": "سعرة", "g": "جم",
    "Close": "إغلاق", "Cancel": "إلغاء", "Save": "حفظ", "Delete": "حذف", "Are you sure?": "هل أنت متأكد؟", "Edit": "تعديل", "Remove": "إزالة",
    "Copy": "نسخ", "Copied": "تم النسخ", "Press Ctrl+C (or Cmd+C) to copy": "اضغط Ctrl+C (أو Cmd+C) للنسخ", "Continue": "متابعة", "Send": "إرسال", "Post": "نشر", "Back": "رجوع", "Refresh": "تحديث",
    "Dismiss": "إخفاء", "Preview": "معاينة", "Exit preview": "إنهاء المعاينة", "Read-only": "للقراءة فقط", "Loading…": "جارٍ التحميل…",
    "Opening the clubhouse": "جارٍ فتح النادي", "Loading your squad…": "جارٍ تحميل فريقك…", "Checking…": "جارٍ التحقق…",
    // errors and notices
    "That email and password don’t match an account. Check them, or reset your password.": "البريد الإلكتروني وكلمة المرور غير متطابقين. تأكد منهما أو أعد تعيين كلمة المرور.",
    "There’s already an account with that email. Sign in instead.": "يوجد حساب بهذا البريد الإلكتروني بالفعل. سجّل الدخول بدلًا من ذلك.",
    "Use a password with at least 6 characters.": "استخدم كلمة مرور من 6 أحرف على الأقل.",
    "That email address doesn’t look right.": "عنوان البريد الإلكتروني غير صحيح.",
    "Too many attempts. Wait a few minutes and try again.": "محاولات كثيرة. انتظر بضع دقائق ثم حاول مرة أخرى.",
    "Couldn’t reach the server. Check your internet connection.": "تعذّر الوصول إلى الخادم. تحقق من اتصالك بالإنترنت.",
    "Enter your password.": "أدخل كلمة المرور.", "Something went wrong (": "حدث خطأ (", "). Try again.": "). حاول مرة أخرى.",
    "You’re offline. Changes will sync when you reconnect.": "أنت غير متصل. ستتم مزامنة التغييرات عند عودة الاتصال.",
    "The club has hit today’s free usage limit. Try again tomorrow.": "وصل النادي إلى حد الاستخدام المجاني اليوم. حاول غدًا.",
    "That didn’t save (": "لم يتم الحفظ (",
    "Couldn’t load the sign-in service. Check your internet connection and reload the page.": "تعذّر تحميل خدمة تسجيل الدخول. تحقق من اتصالك ثم أعد تحميل الصفحة.",
    "You’re not a member of that club any more.": "لم تعد عضوًا في هذا النادي.", "You were removed from the club.": "تمت إزالتك من النادي.",
    "This is a preview. Players make this change from their own account.": "هذه معاينة. يقوم اللاعبون بهذا التغيير من حساباتهم.",
    "This is a preview. Players log from their own account.": "هذه معاينة. يسجّل اللاعبون من حساباتهم.",
    "Your coach can see you’ve read it": "يمكن لمدربك أن يرى أنك قرأتها", "Marked as available": "تم تسجيلك كمتاح",
    "Your coach knows you can’t make it": "مدربك يعرف أنك لن تتمكن من الحضور", "Plan sent": "تم إرسال الخطة", "Plan deleted": "تم حذف الخطة",
    "Sent to ": "أُرسلت إلى ", "Deleted": "تم الحذف", "Stats updated": "تم تحديث الإحصائيات", "Targets saved": "تم حفظ الأهداف",
    "Session updated": "تم تحديث الموعد", "Session added": "تمت إضافة الموعد", "Session deleted": "تم حذف الموعد", "Posted to the board": "تم النشر على اللوحة",
    "Saved": "تم الحفظ", "Club updated": "تم تحديث النادي", "New code ready. The old one no longer works.": "الكود الجديد جاهز. الكود القديم لم يعد يعمل.",
    "You left the club.": "غادرت النادي.", "Workout logged": "تم تسجيل التمرين", "Meal logged": "تم تسجيل الوجبة", "Welcome to the club!": "أهلًا بك في النادي!",
    "Club created. Share the code with your players.": "تم إنشاء النادي. شارك الكود مع لاعبيك.",
    "No club uses that code. Check it with your coach.": "لا يوجد نادٍ بهذا الكود. تأكد منه مع مدربك.",
    "Your data has been downloaded": "تم تنزيل بياناتك", "Your account and data have been deleted.": "تم حذف حسابك وبياناتك.",
    "Gathering your data…": "جارٍ تجميع بياناتك…", "Thanks! Your feedback has been sent.": "شكرًا! تم إرسال رأيك.",
    // roles
    "Head coach": "المدرب الرئيسي", "Coach": "مدرب", "Former member": "عضو سابق", "Player": "لاعب", "Former coach": "مدرب سابق", "Fitness coach": "مدرب اللياقة",
    "Coaches": "المدربون", "Players": "اللاعبون",
    // navigation
    "Squad": "الفريق", "Schedule": "المواعيد", "Board": "اللوحة", "Home": "الرئيسية", "My log": "سجلي", "My season": "موسمي", "Sections": "الأقسام",
    "Switch who you’re viewing as": "غيّر الشخص الذي تشاهد كأنه", "Your account": "حسابك",
    "Coach view · switch": "عرض المدرب · تبديل", "Player view · switch": "عرض اللاعب · تبديل", "Coach · account": "مدرب · الحساب", "Player · account": "لاعب · الحساب",
    // billing banners
    "Your subscription has ended. ": "انتهى اشتراكك. ", "Your 30-day free trial has ended. ": "انتهت الفترة التجريبية المجانية (30 يومًا). ",
    "Everyone can still see and download their data, but nothing new can be added until you subscribe.": "لا يزال الجميع يستطيع رؤية بياناته وتنزيلها، لكن لا يمكن إضافة شيء جديد حتى تشترك.",
    "This club’s subscription has ended, so nothing new can be added for now. Your data is safe. The club owner can renew it.": "انتهى اشتراك هذا النادي، لذا لا يمكن إضافة شيء جديد الآن. بياناتك آمنة. يمكن لمالك النادي تجديده.",
    "Last day of your trial": "آخر يوم في الفترة التجريبية",
    "of your free trial. Subscribe to keep using everything after it ends.": "من الفترة التجريبية المجانية. اشترك لتستمر في استخدام كل شيء بعد انتهائها.",
    "of your free trial. Get in touch and we’ll keep your club running.": "من الفترة التجريبية المجانية. تواصل معنا وسنُبقي ناديك يعمل.",
    "Demo team": "فريق تجريبي",
    "Everything here is example data and resets when you leave. Switch between the coach and a player with the button in the top corner.": "كل ما هنا بيانات تجريبية وتُعاد عند المغادرة. بدّل بين المدرب واللاعب من الزر في أعلى الصفحة.",
    "Switch view": "تبديل العرض", "Create an account": "أنشئ حسابًا",
    // sign in
    "Check your inbox for a link to reset your password. It can take a minute, and may land in spam.": "تحقق من بريدك للحصول على رابط إعادة تعيين كلمة المرور. قد يستغرق دقيقة وقد يصل إلى البريد العشوائي.",
    "The two passwords don’t match.": "كلمتا المرور غير متطابقتين.", "Your name": "اسمك", "e.g. Sam Patel": "مثال: أحمد علي", "Email": "البريد الإلكتروني",
    "Password": "كلمة المرور", "Repeat password": "أعد كتابة كلمة المرور", "Club code (players, optional)": "كود النادي (للاعبين، اختياري)", "e.g. K7P2QX": "مثال: K7P2QX",
    "Sign in": "تسجيل الدخول", "Create your account": "أنشئ حسابك", "Reset your password": "أعد تعيين كلمة المرور",
    "Training, food, attendance and form for coaches and players.": "التمارين والأكل والحضور والمستوى للمدربين واللاعبين.",
    "Create account": "إنشاء حساب", "Send reset link": "أرسل رابط إعادة التعيين", "Forgot password?": "نسيت كلمة المرور؟", "New here? ": "جديد هنا؟ ",
    "← Back to sign in": "→ العودة لتسجيل الدخول", "Look around a demo team first": "جرّب فريقًا تجريبيًا أولًا", "Privacy policy": "سياسة الخصوصية", "Terms of use": "شروط الاستخدام",
    // consent
    "Because you’re under 16, a parent or guardian needs to agree. Please fill this in together with them.": "لأن عمرك أقل من 16 عامًا، يجب أن يوافق أحد الوالدين أو ولي الأمر. املأ هذا معه.",
    "Parent or guardian’s name": "اسم ولي الأمر", "Parent or guardian’s email": "البريد الإلكتروني لولي الأمر",
    "I’m this player’s parent or guardian. I’ve read the privacy policy and I agree to them using Touchline Team.": "أنا ولي أمر هذا اللاعب. قرأت سياسة الخصوصية وأوافق على استخدامه Touchline Team.",
    "Your age": "عمرك", "Under 16": "أقل من 16", "16 or older": "16 أو أكثر",
    "I agree that what I log (meals, nutrition, workouts and availability) can be seen by the coaches of clubs I join.": "أوافق على أن يرى مدربو الأندية التي أنضم إليها ما أسجّله (الوجبات والتغذية والتمارين والحضور).",
    "I agree to the ": "أوافق على ", " and I’ve read the ": " وقرأت ",
    "Tell us whether you’re 16 or older, or under 16.": "أخبرنا إن كان عمرك 16 أو أكثر، أو أقل من 16.",
    "Players under 16 need a parent or guardian’s name and email.": "اللاعبون أقل من 16 عامًا يحتاجون اسم وبريد ولي الأمر.",
    "Your parent or guardian needs to tick the box to agree.": "يجب أن يضع ولي أمرك علامة في المربع للموافقة.",
    "Please agree to coaches seeing what you log. The app can’t work for a club without it.": "يرجى الموافقة على أن يرى المدربون ما تسجّله. لا يمكن للتطبيق أن يعمل مع نادٍ بدون ذلك.",
    "Please agree to the Terms of use and Privacy policy to continue.": "يرجى الموافقة على شروط الاستخدام وسياسة الخصوصية للمتابعة.",
    "We’ve updated our terms": "قمنا بتحديث شروطنا", "Before you start": "قبل أن تبدأ",
    "Please read the updated privacy policy and terms and agree to continue.": "يرجى قراءة سياسة الخصوصية والشروط المحدّثة والموافقة للمتابعة.",
    "Please confirm a few things so we can look after your data properly.": "يرجى تأكيد بعض الأمور حتى نعتني ببياناتك بشكل صحيح.",
    // account
    "Sign out": "تسجيل الخروج", "Delete my account": "حذف حسابي", "Download my data": "تنزيل بياناتي", "Delete ": "حذف ",
    "Couldn’t read this club (you may no longer be a member).": "تعذّرت قراءة هذا النادي (ربما لم تعد عضوًا).",
    "Type the club name to confirm": "اكتب اسم النادي للتأكيد", "Delete club": "حذف النادي", "The name doesn’t match": "الاسم غير مطابق",
    "This permanently deletes your account, your profile and everything you’ve logged: meals, workouts, availability, and the plans, feedback, attendance, ratings and stats your coaches recorded about you. Messages you wrote to a club as a coach stay with the club without your name. This can’t be undone.": "سيؤدي هذا إلى حذف حسابك وملفك وكل ما سجّلته نهائيًا: الوجبات والتمارين والحضور، والخطط والملاحظات والتقييمات والإحصائيات التي سجّلها مدربوك عنك. الرسائل التي كتبتها لنادٍ كمدرب تبقى مع النادي بدون اسمك. لا يمكن التراجع عن ذلك.",
    "Want a copy first? ": "تريد نسخة أولًا؟ ", "Enter your password to confirm": "أدخل كلمة المرور للتأكيد",
    "Your clubs": "أنديتك", " · you’re the owner": " · أنت المالك",
    "You’re not in a club yet. Players: ask your coach for the club code. Coaches: create your club.": "لست في أي نادٍ بعد. اللاعبون: اطلبوا كود النادي من المدرب. المدربون: أنشئوا ناديكم.",
    "Join a club with a code": "انضم إلى نادٍ بالكود", "Create a club (coaches)": "أنشئ ناديًا (للمدربين)", "Edit my name": "تعديل اسمي", "Send feedback": "أرسل رأيك",
    "Help": "مساعدة", "Admin dashboard": "لوحة الإدارة", "Create your club": "أنشئ ناديك",
    "You’ll be the head coach. Afterwards you’ll get a code to share with your players.": "ستكون المدرب الرئيسي. بعدها ستحصل على كود لمشاركته مع لاعبيك.",
    "Your name, as players will see it": "اسمك كما سيراه اللاعبون", "e.g. Coach Sam Patel": "مثال: كابتن أحمد علي",
    "I’m allowed to set this up for my club or team, and I’ll make sure players (and parents of players under 16) know what the app records and who can see it.": "يُسمح لي بإعداد هذا لنادي أو فريقي، وسأتأكد من أن اللاعبين (وأولياء أمور من هم دون 16) يعرفون ما يسجّله التطبيق ومن يمكنه رؤيته.",
    "Create club": "إنشاء النادي", "Join a club": "انضم إلى نادٍ", "Club code from your coach": "كود النادي من مدربك", "Shirt number (optional)": "رقم القميص (اختياري)",
    "Position or event (optional)": "المركز أو التخصص (اختياري)", "e.g. Midfielder": "مثال: لاعب وسط", "Join club": "انضم للنادي", "Name": "الاسم",
    "Edit my details in this club": "تعديل بياناتي في هذا النادي", "My clubs · join or create another": "أنديتي · انضم أو أنشئ ناديًا آخر",
    "Leave club": "مغادرة النادي", "Leave this club": "مغادرة هذا النادي", "Help and guides": "المساعدة والإرشادات",
    // today / next session
    "Nothing scheduled": "لا يوجد مواعيد", "Add your next training or match in Schedule.": "أضف التمرين أو المباراة القادمة من المواعيد.",
    "Your coach hasn’t added the next session yet.": "لم يضف مدربك الموعد القادم بعد.", "Add session": "إضافة موعد", "Training": "تمرين",
    "You said you’ll be there": "قلت إنك ستحضر", "You said you can’t make it": "قلت إنك لن تحضر", "Let your coach know if you’re coming": "أخبر مدربك إن كنت ستحضر",
    "Take register": "سجّل الحضور", "I’ll be there": "سأحضر", "Can’t make it": "لن أحضر", "Reason (your coach sees this)": "السبب (يراه مدربك)",
    "e.g. School exam, ill, family event": "مثال: امتحان، مرض، مناسبة عائلية", "Tell my coach": "أخبر مدربي",
    "Logged food today": "سجّلوا الأكل اليوم", "Players with at least one meal": "لاعبون سجّلوا وجبة واحدة على الأقل", "Avg calories today": "متوسط السعرات اليوم",
    "Players who logged food": "من اللاعبين الذين سجّلوا أكلهم", "Avg protein today": "متوسط البروتين اليوم", "Attendance": "الحضور",
    "Squad average, recorded sessions": "متوسط الفريق في المواعيد المسجّلة", "Needs attention": "يحتاج انتباهك", "Enter": "إدخال", "Register": "الحضور",
    "Squad today": "الفريق اليوم", " · tap a player for their full profile": " · اضغط على لاعب لرؤية ملفه", "tap a player for their full profile": "اضغط على لاعب لرؤية ملفه",
    "Carbs · fat": "كربوهيدرات · دهون", "Training today": "تمرين اليوم", "Form": "المستوى", "No meals yet": "لا توجد وجبات بعد", "Nothing yet": "لا شيء بعد",
    "Match day": "يوم المباراة", "Trained today": "تمرّنوا اليوم", "No workouts logged yet": "لم تُسجّل تمارين بعد", "Plan tasks done": "مهام الخطط المنجزة", "No plans running": "لا توجد خطط حالية", "Duration": "المدة", "45 min": "45 دقيقة", "1 hour": "ساعة", "1 h 15 min": "ساعة و15 دقيقة", "1 h 30 min": "ساعة ونصف", "1 h 45 min": "ساعة و45 دقيقة", "2 hours": "ساعتان", "2 h 30 min": "ساعتان ونصف", "3 hours": "3 ساعات", "4 hours": "4 ساعات", "Repeat weekly": "تكرار أسبوعي", "4 weeks": "4 أسابيع", "8 weeks": "8 أسابيع", "12 weeks": "12 أسبوعًا", "Add to calendar": "أضف إلى التقويم", "Calendar": "التقويم", "Add all to calendar": "أضف الكل إلى التقويم", "Add all sessions to your calendar": "أضف كل المواعيد إلى تقويمك", "iPhone, iPad, Outlook or other calendar": "آيفون أو آيباد أو Outlook أو تقويم آخر", "Google Calendar": "تقويم Google", "If the time or place changes later, add it again.": "إذا تغيّر الوقت أو المكان لاحقًا، أضفه مرة أخرى.", "On Android, open the downloaded file with Google Calendar. If the schedule changes later, add it again.": "على أندرويد، افتح الملف الذي تم تنزيله بتقويم Google. إذا تغيّرت المواعيد لاحقًا، أضفها مرة أخرى.", "Share on WhatsApp": "شارك على واتساب", "WhatsApp": "واتساب", "Monthly report": "التقرير الشهري", "Send summary on WhatsApp": "أرسل الملخص على واتساب", "Print or save as PDF": "اطبع أو احفظ PDF", "Month": "الشهر", "Coach’s note (optional, shown on the report)": "كلمة المدرب (اختياري، تظهر في التقرير)", "Print it, save it as a PDF to send to parents, or send the short summary on WhatsApp.": "اطبعه أو احفظه PDF لإرساله لأولياء الأمور، أو أرسل الملخص القصير على واتساب.", "e.g. Great month. Keep working on your first touch and eat a proper breakfast before training.": "مثال: شهر رائع. استمر في تحسين الاستلام الأول وافطر كويس قبل التمرين.", "or": "أو", "line is the target": "الخط هو الهدف", "present": "حاضر", "late": "متأخر", "absent": "غائب", "excused": "بعذر", "MATCH DAY": "يوم المباراة",
    // player profile
    "Player not found.": "اللاعب غير موجود.", "← Back to squad": "→ العودة للفريق", "See their view": "شاهد ما يراه", "New plan": "خطة جديدة",
    "Give feedback": "أرسل ملاحظة", "Update stats": "تحديث الإحصائيات", "Recent form": "المستوى مؤخرًا", "Coach rating per session, 1–10": "تقييم المدرب لكل موعد، من 1 إلى 10",
    "Last 14 days": "آخر 14 يومًا", " · line is the target": " · الخط هو الهدف", "Food today": "الأكل اليوم", "Set daily targets": "حدد الأهداف اليومية",
    "Targets set by your coach": "أهداف حددها مدربك", "Plans": "الخطط", "No plans yet. Use “New plan” to set one.": "لا توجد خطط بعد. استخدم «خطة جديدة» لإضافة واحدة.",
    "Your coach hasn’t set a plan yet.": "لم يضع مدربك خطة بعد.", "Feedback & instructions": "الملاحظات والتعليمات", "No feedback yet.": "لا توجد ملاحظات بعد.",
    "Recent sessions": "آخر المواعيد", "Recent activity": "آخر النشاط", "No ratings yet. Coaches add them when taking the register.": "لا توجد تقييمات بعد. يضيفها المدربون عند تسجيل الحضور.",
    "No meals logged in the last 14 days.": "لم تُسجّل وجبات في آخر 14 يومًا.", "Daily targets · ": "الأهداف اليومية · ",
    "The player sees these on their home screen and you see progress in the squad table. Leave a box empty for no target.": "يرى اللاعب هذه الأهداف في شاشته الرئيسية وترى أنت تقدّمه في جدول الفريق. اترك الخانة فارغة إن لم يكن هناك هدف.",
    "No attendance recorded yet.": "لم يُسجّل حضور بعد.", " · by ": " · بحلول ", "Delete this plan?": "حذف هذه الخطة؟",
    "Instruction": "تعليمات", "Feedback": "ملاحظة", "✓ Got it": "✓ تمام", "Got it": "تمام", "Not confirmed yet": "لم يؤكد بعد", "Delete this message?": "حذف هذه الرسالة؟",
    "Numbers estimated by AI": "أرقام تقديرية بالذكاء الاصطناعي", "From photo": "من صورة", "AI estimate": "تقدير بالذكاء الاصطناعي", "Nothing logged yet.": "لم يُسجّل شيء بعد.",
    "Delete entry": "حذف التسجيل", "Delete this entry?": "حذف هذا التسجيل؟", "Last sessions, oldest to newest": "آخر المواعيد، من الأقدم للأحدث",
    // logging
    "Log a workout": "سجّل تمرينًا", "Type": "النوع", "Date": "التاريخ", "Notes (optional)": "ملاحظات (اختياري)", "e.g. 5×5 squats at 80 kg, felt strong": "مثال: 5×5 سكوات بوزن 80 كجم، كنت قويًا",
    "The food scanner is busy or has hit today’s limit. Try again in a minute, or fill in the numbers yourself.": "ماسح الأكل مشغول أو وصل لحد اليوم. حاول بعد دقيقة أو اكتب الأرقام بنفسك.",
    "Couldn’t reach the food scanner. Check your connection and try again.": "تعذّر الوصول لماسح الأكل. تحقق من اتصالك وحاول مرة أخرى.",
    "Food scanning isn’t switched on yet. The site owner needs to turn on AI Logic in Firebase.": "مسح الأكل غير مفعّل بعد.",
    "The food scanner couldn’t work this one out. Try a clearer photo or add a description.": "لم يتمكن الماسح من التعرف على هذه الوجبة. جرّب صورة أوضح أو أضف وصفًا.",
    "That file isn’t a photo the browser can open.": "هذا الملف ليس صورة يمكن للمتصفح فتحها.",
    "e.g. Chicken breast, a bowl of rice, broccoli and a glass of orange juice": "مثال: صدر فراخ، طبق رز، بروكلي وكوباية عصير برتقال",
    "Your meal photo": "صورة وجبتك", "Scan a photo": "امسح صورة", "Use my description": "استخدم وصفي",
    "Describe the meal first, or scan a photo.": "صِف الوجبة أولًا أو امسح صورة.", "Looking at your photo…": "جارٍ فحص صورتك…", "Working out the nutrition…": "جارٍ حساب القيم الغذائية…",
    "No food found in that photo. Try another one, or describe the meal.": "لم يُعثر على أكل في الصورة. جرّب صورة أخرى أو صِف الوجبة.",
    "Couldn’t recognise any food in that description.": "لم يتم التعرف على أي أكل في الوصف.", "What the scanner found · check and adjust": "ما وجده الماسح · راجِع وعدّل",
    "Couldn’t open that photo.": "تعذّر فتح الصورة.", "Log a meal": "سجّل وجبة", "Meal": "الوجبة",
    "Photo and description scanning is available for players aged 16 and over. Fill in the numbers below, or ask a parent or coach to help.": "المسح بالصورة أو الوصف متاح للاعبين من عمر 16 فما فوق. اكتب الأرقام بالأسفل أو اطلب مساعدة ولي الأمر أو المدرب.",
    "What did you eat?": "ماذا أكلت؟", "Nutrition (fill in or let the scanner do it)": "القيم الغذائية (اكتبها أو دع الماسح يحسبها)",
    "Scanning sends the photo or description to Google’s Gemini AI to work out the numbers. We don’t save photos. Numbers are estimates, not medical or dietary advice.": "المسح يرسل الصورة أو الوصف إلى Gemini من Google لحساب الأرقام. لا نحفظ الصور. الأرقام تقديرية وليست نصيحة طبية أو غذائية.",
    "Calories (kcal)": "السعرات (سعرة)", "Protein (g)": "البروتين (جم)", "Carbs (g)": "الكربوهيدرات (جم)", "Fat (g)": "الدهون (جم)",
    // player home
    "From your coach": "من مدربك", "You’re in the squad": "أنت في التشكيلة", "Squad announced": "تم إعلان التشكيلة", "See squad": "شاهد التشكيلة",
    "Today’s food": "أكل اليوم", "Your targets are set by your coach": "أهدافك يحددها مدربك", "Your plan": "خطتك", "All plans": "كل الخطط",
    "All caught up. No open plan items.": "كل شيء تمام. لا توجد مهام مفتوحة.", "Add to your log": "أضف إلى سجلك", "History": "السجل",
    "Only you and your coaches can see this": "أنت ومدربوك فقط يمكنكم رؤية هذا", "M": "و", "W": "ت",
    // squad tab
    "Add your players": "أضف لاعبيك", "Invite players": "ادعُ اللاعبين",
    "Make a new code? The current code and link will stop working for anyone who hasn’t joined yet.": "إنشاء كود جديد؟ الكود والرابط الحاليان سيتوقفان عن العمل لمن لم ينضم بعد.",
    "Make new code": "إنشاء كود جديد", "New code": "كود جديد",
    "Players create a free account and enter this code, or just open the link. They appear in your squad as soon as they join.": "ينشئ اللاعبون حسابًا مجانيًا ويدخلون هذا الكود، أو يفتحون الرابط فقط. يظهرون في فريقك فور انضمامهم.",
    "Club code": "كود النادي", "Invite link": "رابط الدعوة", "Copy link": "نسخ الرابط",
    "Assistant coaches join with the same code. The club owner can then make them a coach.": "ينضم المدربون المساعدون بنفس الكود، ثم يمكن لمالك النادي جعلهم مدربين.",
    "Profile": "الملف", "No players yet. Share the code above.": "لا يوجد لاعبون بعد. شارك الكود بالأعلى.", "Coaching staff": "الجهاز الفني", "Club": "النادي",
    "Edit club": "تعديل النادي", "Delete club and all its data": "حذف النادي وكل بياناته", "My details": "بياناتي", "Edit ": "تعديل ",
    "Full name": "الاسم الكامل", "Shirt number": "رقم القميص", "Title": "العنوان", "Position or event": "المركز أو التخصص", "Role": "الدور",
    "Coach (sees everyone’s data)": "مدرب (يرى بيانات الجميع)",
    // plans and feedback
    "e.g. Week 7: return from hamstring tightness": "مثال: الأسبوع 7: العودة بعد شد العضلة الخلفية", "One task per line": "مهمة في كل سطر",
    "Finish by": "الانتهاء بحلول", "Note (optional)": "ملاحظة (اختياري)", "Give this plan to": "أعطِ هذه الخطة إلى", "Send plan": "إرسال الخطة",
    "Pick at least one player": "اختر لاعبًا واحدًا على الأقل", "Add at least one task": "أضف مهمة واحدة على الأقل", "Message ": "رسالة إلى ",
    "Instruction (they confirm)": "تعليمات (يؤكدها اللاعب)", "Message": "رسالة", "e.g. Great pressing on Saturday. Next step: scan before you receive.": "مثال: ضغط رائع يوم السبت. الخطوة التالية: انظر حولك قبل استلام الكرة.",
    "Season stats · ": "إحصائيات الموسم · ",
    // schedule
    "Register not taken": "لم يُسجّل الحضور", "Going": "سيحضر", "Edit register": "تعديل الحضور", "Coming up": "القادم", "Nothing scheduled.": "لا يوجد مواعيد.",
    "Past sessions": "المواعيد السابقة", "No past sessions yet.": "لا توجد مواعيد سابقة بعد.", "Repeat weekly": "تكرار أسبوعي", "Just once": "مرة واحدة",
    "Edit session": "تعديل الموعد", "e.g. Tactical session, or vs Northgate": "مثال: تمرين تكتيكي، أو ضد الأهلي", "Time": "الوقت", "Location": "المكان", "e.g. Pitch 2": "مثال: ملعب 2",
    "Delete this session and its register?": "حذف هذا الموعد وسجل حضوره؟", "Register · ": "الحضور · ", "Mark the rest present": "سجّل الباقين حاضرين",
    "can’t make it": "لن يحضر", "Rating for ": "تقييم ", "No players in the squad yet.": "لا يوجد لاعبون في الفريق بعد.", "Save register": "حفظ الحضور",
    "Mark at least one player": "سجّل لاعبًا واحدًا على الأقل", "TRAINING": "تمرين", "MATCH": "مباراة",
    // board
    "Team board": "لوحة الفريق", "Nothing posted yet. Post a notice or a match-day squad.": "لم يُنشر شيء بعد. انشر إعلانًا أو تشكيلة المباراة.",
    "No announcements yet.": "لا توجد إعلانات بعد.", "Tell your coach if you can make it": "أخبر مدربك إن كنت ستحضر", "Notice": "إعلان", "Delete this post?": "حذف هذا المنشور؟",
    "Post to the team": "انشر للفريق", "e.g. Squad for Saturday vs Northgate": "مثال: تشكيلة السبت ضد الأهلي", "Details": "التفاصيل",
    "e.g. Meet 9:45 at the clubhouse. Bring home and away kit.": "مثال: التجمع 9:45 في النادي. أحضر الطقمين.", "Pick the players in the squad": "اختر لاعبي التشكيلة",
    "Match-day squad": "تشكيلة المباراة", "MATCH-DAY SQUAD": "تشكيلة المباراة", "NOTICE": "إعلان",
    // club settings
    "Club or team name": "اسم النادي أو الفريق", "e.g. Northside Tennis Academy": "مثال: أكاديمية النصر للتنس", "Sport": "الرياضة", "Season": "الموسم",
    // feedback form
    "Idea": "فكرة", "Create an account to send feedback.": "أنشئ حسابًا لإرسال رأيك.",
    "Tell us what works, what’s confusing or what you’d like next. It goes straight to the people who build Touchline Team.": "أخبرنا بما يعمل جيدًا وما هو مربك وما تريده لاحقًا. يصل مباشرة لفريق Touchline Team.",
    "What kind?": "ما النوع؟", "Problem": "مشكلة", "Something’s wrong": "شيء لا يعمل", "Question": "سؤال", "Praise": "إشادة", "Something I like": "شيء أعجبني",
    "Your message": "رسالتك", "e.g. It would help if coaches could…": "مثال: سيكون مفيدًا لو استطاع المدربون…",
    // subscription
    "$20/month": "20$ شهريًا", "Your club is read-only until you subscribe. Open Squad → Subscription.": "ناديك للقراءة فقط حتى تشترك. افتح الفريق ← الاشتراك.",
    "The club is read-only right now. The club owner needs to renew the subscription.": "النادي للقراءة فقط الآن. يجب على مالك النادي تجديد الاشتراك.",
    "Online payment isn’t set up yet. Please contact us to subscribe.": "الدفع الإلكتروني غير متاح بعد. تواصل معنا للاشتراك.",
    "Opening secure checkout. Your club unlocks as soon as payment is confirmed.": "جارٍ فتح صفحة الدفع الآمن. سيُفتح ناديك فور تأكيد الدفع.",
    "Subscribed": "مشترك", "Nothing new can be added until the club subscribes. All data is kept and can still be viewed, downloaded or deleted.": "لا يمكن إضافة شيء جديد حتى يشترك النادي. كل البيانات محفوظة ويمكن عرضها أو تنزيلها أو حذفها.",
    "Early access": "وصول مبكر", "Your club joined before subscriptions started. Thanks for being one of the first!": "انضم ناديك قبل بدء الاشتراكات. شكرًا لكونك من الأوائل!",
    "Subscription": "الاشتراك", "Manage billing": "إدارة الدفع", "Only the club owner can manage the subscription.": "مالك النادي فقط يمكنه إدارة الاشتراك.",
    "Online payment is coming soon. While we’re testing with our first clubs, just get in touch before your trial ends and we’ll keep your club running.": "الدفع الإلكتروني قريبًا. خلال تجربتنا مع أول الأندية، تواصل معنا قبل انتهاء الفترة التجريبية وسنُبقي ناديك يعمل.",
    "Keep our club running: ": "أبقوا نادينا يعمل: ", "Club reference: ": "مرجع النادي: ", "Get in touch": "تواصل معنا", "Free trial": "تجربة مجانية", "Subscribe": "اشترك",
    // demo picker
    "View the demo as…": "شاهد التجربة كـ…", "Coaches see the whole squad. Players see only their own log, plan and feedback.": "المدربون يرون الفريق كله. اللاعبون يرون سجلهم وخطتهم وملاحظاتهم فقط.",
    // demo positions and content
    "Goalkeeper": "حارس مرمى", "Right back": "ظهير أيمن", "Centre back": "قلب دفاع", "Defensive mid": "وسط مدافع", "Central mid": "وسط", "Attacking mid": "وسط مهاجم",
    "Right wing": "جناح أيمن", "Striker": "مهاجم", "Pressing & transitions": "الضغط والتحولات", "Set pieces + small-sided games": "كرات ثابتة + مباريات مصغّرة",
    "Pitch 2": "ملعب 2", "Riverside Park": "ملعب ريفرسايد", "Away": "خارج الأرض", "Home": "الرئيسية",
    "Oats, banana, peanut butter": "شوفان، موز، زبدة فول سوداني", "Scrambled eggs on toast, orange juice": "بيض مخفوق على توست، عصير برتقال",
    "Greek yoghurt, berries, granola": "زبادي يوناني، توت، جرانولا", "Chicken wrap, salad, apple": "راب فراخ، سلطة، تفاحة", "Tuna pasta with sweetcorn": "مكرونة بالتونة والذرة",
    "Rice bowl with salmon and greens": "طبق رز بالسلمون والخضار", "Spaghetti bolognese, side salad": "سباجيتي بولونيز وسلطة", "Grilled chicken, sweet potato, broccoli": "فراخ مشوية، بطاطا، بروكلي",
    "Beef stir fry with noodles": "لحم سوتيه مع نودلز", "Protein shake with milk": "بروتين شيك باللبن", "Rice cakes and honey": "رايس كيك وعسل", "Trail mix": "مكسرات مشكلة",
    "Grilled chicken, rice and salad": "فراخ مشوية، رز وسلطة",
    "Lower body, felt good": "الجزء السفلي، كنت كويس", "Easy 5 km": "5 كم خفيف", "Foam roll + stretching": "فوم رولر + إطالات", "School exam": "امتحان",
    "Meet 9:45 at the clubhouse. Bring both kits and shin pads. Remy, come and see me before the warm-up.": "التجمع 9:45 في النادي. أحضروا الطقمين وواقي الساق. ريمي، تعالَ قابلني قبل الإحماء.",
    "New training kit collection": "استلام طقم التدريب الجديد",
    "Kit is in. Collect yours from the clubhouse after Tuesday’s session. Sizes are on the sheet by the door.": "الطقم وصل. استلم طقمك من النادي بعد تمرين الثلاثاء. المقاسات على الورقة بجوار الباب.",
    "Hydration reminder for the heat": "تذكير بشرب المياه في الحر", "Aim for 2.5–3 L a day this week and drink 500 ml in the two hours before training.": "اشرب 2.5–3 لتر يوميًا هذا الأسبوع و500 مل خلال الساعتين قبل التمرين.",
    "Calf load management": "التحكم في حمل عضلة السمانة", "Tell me straight away if pain goes above 3/10.": "أخبرني فورًا إذا زاد الألم عن 3 من 10.",
    "Daily: calf raises 3×15, slow on the way down": "يوميًا: رفع السمانة 3×15، ببطء أثناء النزول", "Mon: 20 min easy bike + mobility": "الإثنين: 20 دقيقة عجلة خفيفة + مرونة",
    "Tue: Team training, no sprinting drills": "الثلاثاء: تمرين الفريق بدون تمارين سرعة", "Wed: Pool recovery session": "الأربعاء: استشفاء في حمام السباحة",
    "Every night: 8+ hours sleep": "كل ليلة: نوم 8 ساعات أو أكثر", "Strength block, week 3": "برنامج القوة، الأسبوع 3", "Gym A: squat 4×6 at 75%": "جيم أ: سكوات 4×6 بنسبة 75%",
    "Gym B: RDL + Nordic curls": "جيم ب: RDL + نورديك كيرل", "2 × 20 min tempo runs": "2 × 20 دقيقة جري متوسط السرعة", "Finishing homework": "واجب التسديد",
    "50 finishes with your weaker foot after training": "50 تسديدة بالقدم الأضعف بعد التمرين",
    "Watch clip pack: runs in behind": "شاهد المقاطع: الجري خلف الدفاع",
    "You’ve missed the last few sessions. Message me today so we can sort it out.": "غبت عن آخر كام تمرين. كلمني النهارده عشان نحل الموضوع.",
    "Brilliant last week. Your pressing triggered both turnovers that led to goals. Keep scanning before you receive.": "أداء رائع الأسبوع الماضي. ضغطك تسبب في استخلاص الكرتين اللتين جاء منهما الهدفان. استمر في النظر حولك قبل الاستلام.",
    "Pre-match meal at least 3 hours before kick-off: carbs plus some lean protein. No fried food.": "وجبة ما قبل المباراة قبل البداية بـ3 ساعات على الأقل: كربوهيدرات مع بروتين خفيف. بدون أكل مقلي.",
    "Skip sprints this week and follow the calf plan. We want you fit for the derby.": "لا تمارين سرعة هذا الأسبوع واتبع خطة السمانة. نريدك جاهزًا للديربي.",

    /* ---------- front page ---------- */
    "Features": "المميزات", "How it works": "طريقة العمل", "Privacy": "الخصوصية", "Pricing": "السعر", "FAQ": "أسئلة شائعة", "Start free trial": "ابدأ التجربة المجانية",
    "Know how your squad": "اعرف كيف يأكل فريقك،", "eats, trains and turns up.": "ويتدرب، ويحضر.",
    "Touchline Team gives every coach one place to see each player’s food, training, attendance and form, and gives every player a simple way to log it. Snap a photo of a meal and it works out the calories, protein, carbs and fat.": "يمنح Touchline Team كل مدرب مكانًا واحدًا يرى فيه أكل كل لاعب وتمارينه وحضوره ومستواه، ويمنح كل لاعب طريقة سهلة لتسجيلها. صوّر وجبتك وسيحسب السعرات والبروتين والكربوهيدرات والدهون.",
    "Start 30-day free trial": "ابدأ تجربة مجانية لمدة 30 يومًا", "Try the demo team": "جرّب الفريق التجريبي",
    "30-day free trial, no card needed. Then $20 a month per club. Works in any phone or computer browser, so there’s nothing to install.": "تجربة مجانية 30 يومًا بدون بطاقة. بعدها 20$ شهريًا لكل نادٍ. يعمل على متصفح أي موبايل أو كمبيوتر، فلا يوجد ما تحتاج لتثبيته.",
    "Sat": "السبت", "vs Kingsway Colts": "ضد كينجزواي كولتس", "Ade can’t make Saturday: school exam": "أدي لن يحضر السبت: امتحان",
    "Attacking mid ·": "وسط مهاجم ·", "Centre back ·": "قلب دفاع ·", "Goalkeeper ·": "حارس مرمى ·",
    "From photo · check and adjust": "من صورة · راجِع وعدّل", "Chicken tikka masala · 250 g": "فراخ تكا ماسالا · 250 جم", "White rice · 200 g": "رز أبيض · 200 جم", "Fresh coriander · 2 g": "كزبرة · 2 جم",
    "Everything a coach checks before training, in one screen": "كل ما يراجعه المدرب قبل التمرين، في شاشة واحدة",
    "No more chasing players on group chats or keeping spreadsheets. Players log in seconds, and coaches see the whole squad live.": "لا مزيد من مطاردة اللاعبين في جروبات الواتساب أو جداول الإكسل. يسجّل اللاعبون في ثوانٍ، ويرى المدربون الفريق كله مباشرة.",
    "Food tracking with photo scan": "متابعة الأكل بمسح الصورة",
    "Players snap their plate or describe the meal, and AI works out calories, protein, carbs and fat. They can correct the numbers before saving. Coaches set daily targets per player.": "يصوّر اللاعب طبقه أو يصف وجبته، فيحسب الذكاء الاصطناعي السعرات والبروتين والكربوهيدرات والدهون. يمكنه تصحيح الأرقام قبل الحفظ. ويحدد المدرب أهدافًا يومية لكل لاعب.",
    "Registers and form": "الحضور والمستوى",
    "Take the register in a few taps after each session and add a 1–10 rating if you want. Attendance rates and a form chart build up for every player across the season.": "سجّل الحضور بضغطات قليلة بعد كل موعد وأضف تقييمًا من 1 إلى 10 إن أردت. تتكوّن نسب الحضور ومنحنى المستوى لكل لاعب على مدار الموسم.",
    "Plans, feedback and instructions": "خطط وملاحظات وتعليمات",
    "Send a player a training plan as a checklist, or feedback after a match. Instructions need a “Got it” from the player, so you know they’ve read them.": "أرسل للاعب خطة تدريب كقائمة مهام، أو ملاحظة بعد المباراة. التعليمات تحتاج «تمام» من اللاعب، فتعرف أنه قرأها.",
    "Availability before every session": "معرفة الحضور قبل كل موعد",
    "Players say “I’ll be there” or “Can’t make it” with a reason. You see who’s coming before you plan the session, and absences arrive already marked as excused.": "يقول اللاعبون «سأحضر» أو «لن أحضر» مع السبب. ترى من سيحضر قبل أن تخطط للتمرين، والغيابات تصلك مسجّلة بعذر.",
    "Match-day squads and notices": "تشكيلات المباريات والإعلانات",
    "Post the squad for Saturday or a kit reminder to the team board. Selected players see a “You’re in the squad” banner as soon as they open the app.": "انشر تشكيلة السبت أو تذكيرًا بالطقم على لوحة الفريق. يرى اللاعبون المختارون «أنت في التشكيلة» فور فتح التطبيق.",
    "Alerts that matter": "تنبيهات مهمة",
    "The coach’s Today screen flags who has missed sessions, who can’t make the next one, who is well under their protein target, and who hasn’t read your instructions.": "شاشة «اليوم» للمدرب تنبّهك لمن غاب عن التمارين، ومن لن يحضر الموعد القادم، ومن هو أقل بكثير من هدف البروتين، ومن لم يقرأ تعليماتك.",
    "For coaches": "للمدربين", "See the whole squad’s food and training today, against each player’s targets": "شاهد أكل وتمارين الفريق كله اليوم مقارنة بأهداف كل لاعب",
    "Registers, ratings, attendance rates and form charts that build themselves": "حضور وتقييمات ونسب حضور ومنحنيات مستوى تتكوّن تلقائيًا",
    "Plans, feedback and instructions that players confirm": "خطط وملاحظات وتعليمات يؤكدها اللاعبون",
    "Share one code to bring your squad in. Assistant coaches welcome": "شارك كودًا واحدًا لضم فريقك. المدربون المساعدون مرحّب بهم",
    "For players": "للاعبين", "Log a meal in seconds by photo, description or typing the numbers": "سجّل وجبتك في ثوانٍ بصورة أو وصف أو بكتابة الأرقام",
    "See today’s calories and protein against your targets": "شاهد سعرات وبروتين اليوم مقارنة بأهدافك", "Tick off your plan and confirm instructions from your coach": "أنجز خطتك وأكّد تعليمات مدربك",
    "Your own attendance, ratings and season stats in one place": "حضورك وتقييماتك وإحصائيات موسمك في مكان واحد",
    "Your squad set up in five minutes": "فريقك جاهز في خمس دقائق", "Sign up as a coach, name your club, and pick your sport. Stats and wording adjust to fit it.": "سجّل كمدرب، سمِّ ناديك واختر رياضتك. تتغير الإحصائيات والمصطلحات لتناسبها.",
    "Share your code": "شارك الكود", "You get a club code like": "ستحصل على كود للنادي مثل", "and an invite link. Send it to the team chat, and players join from their phone.": "ورابط دعوة. أرسله في جروب الفريق، وسينضم اللاعبون من موبايلاتهم.",
    "Coach from one screen": "درّب من شاشة واحدة", "Food, training, availability, attendance and form for everyone, live, with alerts for anything that needs you.": "الأكل والتمارين والحضور والمستوى للجميع، مباشرة، مع تنبيهات لكل ما يحتاجك.",
    "Privacy and safety": "الخصوصية والأمان", "Built for young athletes from day one": "مصمم للرياضيين الصغار من اليوم الأول",
    "Food diaries and ratings are personal. Touchline Team keeps them between each player and their coaches.": "سجلات الأكل والتقييمات شخصية. يحفظها Touchline Team بين كل لاعب ومدربيه فقط.",
    "Players only see their own data": "كل لاعب يرى بياناته فقط", "Teammates can’t see each other’s food, ratings, plans or feedback. This is enforced on the server, not just hidden on screen.": "لا يرى زملاء الفريق أكل أو تقييمات أو خطط أو ملاحظات بعضهم. هذا مُطبّق على الخادم، وليس مخفيًا على الشاشة فقط.",
    "Parent or guardian consent for under-16s": "موافقة ولي الأمر لمن هم دون 16", "Younger players can only join with a parent or guardian’s agreement, and AI food scanning is switched off for them.": "لا ينضم اللاعبون الأصغر إلا بموافقة ولي الأمر، ومسح الأكل بالذكاء الاصطناعي مُغلق لهم.",
    "Only coaches set ratings and stats": "المدربون فقط يضعون التقييمات والإحصائيات", "Players can’t edit their own ratings, attendance or targets. Only the club owner decides who is a coach.": "لا يستطيع اللاعبون تعديل تقييماتهم أو حضورهم أو أهدافهم. ومالك النادي فقط يحدد من هو المدرب.",
    "Download or delete any time": "نزّل أو احذف في أي وقت", "Anyone can download everything stored about them or delete their account. Club owners can delete a club and all its data.": "يمكن لأي شخص تنزيل كل ما هو محفوظ عنه أو حذف حسابه. ويمكن لمالكي الأندية حذف النادي وكل بياناته.",
    "No ads, no selling data": "بدون إعلانات، وبدون بيع بيانات", "We don’t show ads and we never sell or share your data for marketing. Meal photos aren’t stored.": "لا نعرض إعلانات ولا نبيع أو نشارك بياناتك للتسويق أبدًا. صور الوجبات لا تُحفظ.",
    "Clear, plain-language policies": "سياسات واضحة وبسيطة", "Read our": "اقرأ", "privacy policy": "سياسة الخصوصية", "and": "و", "terms of use": "شروط الاستخدام",
    "One simple price per club": "سعر واحد بسيط لكل نادٍ", "Try everything free for 30 days. No card needed to start, and no charge unless you choose to subscribe.": "جرّب كل شيء مجانًا لمدة 30 يومًا. لا تحتاج بطاقة للبدء، ولا رسوم إلا إذا اخترت الاشتراك.",
    "/ month per club": "/ شهريًا لكل نادٍ", "Unlimited players and coaches": "عدد غير محدود من اللاعبين والمدربين", "Every feature, including photo food scanning": "كل المميزات، بما فيها مسح الأكل بالصورة",
    "30-day free trial, no card needed": "تجربة مجانية 30 يومًا بدون بطاقة", "Cancel any time. If you stop, your club becomes read-only and nothing is deleted": "ألغِ في أي وقت. إذا توقفت يصبح ناديك للقراءة فقط ولا يُحذف شيء",
    "Questions coaches ask": "أسئلة يسألها المدربون", "Do players need to download an app?": "هل يحتاج اللاعبون لتنزيل تطبيق؟",
    "No. It works in any up-to-date browser on a phone, tablet or computer. On a phone, players can use “Add to Home Screen” so it opens like an app.": "لا. يعمل على أي متصفح حديث في الموبايل أو التابلت أو الكمبيوتر. وعلى الموبايل يمكن استخدام «إضافة إلى الشاشة الرئيسية» ليفتح كتطبيق.",
    "Which sports does it work for?": "ما الرياضات المدعومة؟", "Any team or individual sport. Football, basketball, tennis and gymnastics have their own season stats and wording (like “Match” or “Meet”), and there’s a general option for everything else.": "أي رياضة جماعية أو فردية. كرة القدم والسلة والتنس والجمباز لها إحصائيات ومصطلحات خاصة، وهناك خيار عام لباقي الرياضات.",
    "How accurate is the photo food scanning?": "ما دقة مسح الأكل بالصورة؟", "It gives a good estimate for everyday meals, but it isn’t exact. Portions are hard to judge from a photo. Players see what the scanner found and can adjust the numbers before saving, and they can always type the numbers themselves. It’s a tool for building good habits, not medical or dietary advice.": "يعطي تقديرًا جيدًا للوجبات اليومية لكنه ليس دقيقًا تمامًا، فالكميات صعب تقديرها من صورة. يرى اللاعب ما وجده الماسح ويمكنه تعديل الأرقام قبل الحفظ أو كتابتها بنفسه. إنه أداة لبناء عادات جيدة وليس نصيحة طبية أو غذائية.",
    "Can players see each other’s data?": "هل يرى اللاعبون بيانات بعضهم؟", "No. Teammates see each other’s names, shirt numbers and squad selections, but food logs, ratings, plans and feedback are only visible to the player and their coaches.": "لا. يرى الزملاء الأسماء وأرقام القمصان والتشكيلات فقط، أما سجلات الأكل والتقييمات والخطط والملاحظات فلا يراها إلا اللاعب ومدربوه.",
    "We have players under 16. Is that OK?": "لدينا لاعبون أقل من 16 عامًا. هل هذا مناسب؟", "Yes. Under-16s need a parent or guardian to agree when they sign up, and AI food scanning is switched off for their accounts. Coaches confirm they’ll tell players and parents what the app records.": "نعم. من هم دون 16 يحتاجون موافقة ولي الأمر عند التسجيل، ومسح الأكل بالذكاء الاصطناعي مُغلق لحساباتهم. ويؤكد المدربون أنهم سيُعلمون اللاعبين وأولياء الأمور بما يسجّله التطبيق.",
    "Can I have more than one coach?": "هل يمكن أن يكون هناك أكثر من مدرب؟", "Yes. Assistant coaches join with the same club code, and the club owner makes them a coach. Coaches see the whole squad. Only the owner can change roles or delete the club.": "نعم. ينضم المدربون المساعدون بنفس كود النادي، ويجعلهم المالك مدربين. يرى المدربون الفريق كله، والمالك فقط يغيّر الأدوار أو يحذف النادي.",
    "What happens to our data if we stop using it?": "ماذا يحدث لبياناتنا إذا توقفنا؟", "The club owner can delete the club and everything in it at any time. Players can download their own data or delete their accounts whenever they like.": "يمكن لمالك النادي حذف النادي وكل ما فيه في أي وقت. ويمكن للاعبين تنزيل بياناتهم أو حذف حساباتهم متى شاءوا.",
    "What does it cost?": "كم التكلفة؟", "$20 a month per club, with unlimited players and coaches. Every new club gets a 30-day free trial with no card needed. The club owner pays, players and parents never do.": "20$ شهريًا لكل نادٍ، بعدد غير محدود من اللاعبين والمدربين. كل نادٍ جديد يحصل على تجربة مجانية 30 يومًا بدون بطاقة. مالك النادي هو من يدفع، واللاعبون وأولياء الأمور لا يدفعون أبدًا.",
    "What happens if we stop paying?": "ماذا يحدث إذا توقفنا عن الدفع؟", "Your club becomes read-only. Everyone can still see and download their data, and nothing is deleted. Subscribe again and everything carries on where you left off.": "يصبح ناديك للقراءة فقط. يستطيع الجميع رؤية بياناتهم وتنزيلها ولا يُحذف شيء. اشترك مجددًا ويستمر كل شيء من حيث توقفت.",
    "Ready to see your squad clearly?": "مستعد لترى فريقك بوضوح؟", "Set up your club in five minutes and try it free for 30 days, or look around a demo team first.": "جهّز ناديك في خمس دقائق وجرّبه مجانًا لمدة 30 يومًا، أو تصفّح فريقًا تجريبيًا أولًا.",
    "Questions? Email": "عندك سؤال؟ راسلنا على", "Demo": "تجربة",
    "Page sections": "أقسام الصفحة", "Sports": "الرياضات", "Example of the coach’s Today screen": "مثال على شاشة «اليوم» للمدرب", "Example of a scanned meal": "مثال على وجبة ممسوحة",
    "A bowl of chicken tikka masala with white rice and coriander": "طبق فراخ تكا ماسالا مع رز أبيض وكزبرة", "Footer": "التذييل", "Touchline Team home": "الصفحة الرئيسية لـ Touchline Team",
  };

  /* ---------- text with names or numbers in it ---------- */
  function t(s) { var r = tr(s); return r == null ? s : r; }
  var PAT = [
    [/^(\d+) available · (\d+) can’t make it · (\d+) no reply$/, function (m) { return m[1] + " سيحضر · " + m[2] + " لن يحضر · " + m[3] + " لم يرد"; }],
    [/^(\d+) available · (\d+) can’t · (\d+) no reply$/, function (m) { return m[1] + " سيحضر · " + m[2] + " لن يحضر · " + m[3] + " لم يرد"; }],
    [/^(\d+) available$/, function (m) { return m[1] + " سيحضر"; }],
    [/^(\d+) can’t make it$/, function (m) { return m[1] + " لن يحضر"; }],
    [/^(\d+) no reply$/, function (m) { return m[1] + " لم يرد"; }],
    [/^Plan sent to (\d+) players$/, function (m) { return "تم إرسال الخطة إلى " + m[1] + " لاعبين"; }],
    [/^Register saved · (\d+) players$/, function (m) { return "تم حفظ الحضور · " + m[1] + " لاعبين"; }],
    [/^(.+) is now a coach$/, function (m) { return "أصبح " + m[1] + " مدربًا"; }],
    [/^(.+) is now a player$/, function (m) { return "أصبح " + m[1] + " لاعبًا"; }],
    [/^(.+) removed from the club$/, function (m) { return "تمت إزالة " + m[1] + " من النادي"; }],
    [/^Season (.+) stats$/, function (m) { return "إحصائيات موسم " + m[1]; }],
    [/^Season (.*)$/, function (m) { return "موسم " + m[1]; }],
    [/^(\d+) players?$/, function (m) { return m[1] === "1" ? "لاعب واحد" : m[1] + " لاعبين"; }],
    [/^Players \((\d+)\)$/, function (m) { return "اللاعبون (" + m[1] + ")"; }],
    [/^You’re seeing what (.+) sees\. Nothing can be changed here\.$/, function (m) { return "أنت ترى ما يراه " + m[1] + ". لا يمكن تغيير شيء هنا."; }],
    [/^(\d+) days? left$/, function (m) { return "متبقٍ " + m[1] + " يوم"; }],
    [/^You’ve been invited to join a club \(code (\w+)\)\. Sign in or create an account to join\.$/, function (m) { return "تمت دعوتك للانضمام إلى نادٍ (الكود " + m[1] + "). سجّل الدخول أو أنشئ حسابًا للانضمام."; }],
    [/^This permanently deletes (.+?) and everything in it: .*$/, function (m) { return "سيؤدي هذا إلى حذف " + m[1] + " وكل ما فيه نهائيًا: قائمة الفريق والمواعيد والحضور والتقييمات والخطط والملاحظات والإعلانات وسجلات كل اللاعبين. يحتفظ اللاعبون بحساباتهم لكن يفقدون الوصول. لا يمكن التراجع عن ذلك."; }],
    [/^(.+) has been deleted$/, function (m) { return "تم حذف " + m[1]; }],
    [/^Leave (.+)\? Your coach will no longer see your logs\.$/, function (m) { return "مغادرة " + m[1] + "؟ لن يرى مدربك سجلاتك بعد الآن."; }],
    [/^Register not taken for (.+) \((.+)\)$/, function (m) { return "لم يُسجّل الحضور لـ " + t(m[1]) + " (" + m[2] + ")"; }],
    [/^(.+) missed the last 2 sessions without an excuse$/, function (m) { return "غاب " + m[1] + " عن آخر موعدين بدون عذر"; }],
    [/^(.+?) can’t make (.+?): (.+)$/, function (m) { return m[1] + " لن يحضر " + t(m[2]) + ": " + t(m[3]); }],
    [/^(.+?) can’t make (.+)$/, function (m) { return m[1] + " لن يحضر " + t(m[2]); }],
    [/^(.+) is well under their protein target today \((\d+) of (\d+) g\)$/, function (m) { return m[1] + " أقل بكثير من هدف البروتين اليوم (" + m[2] + " من " + m[3] + " جم)"; }],
    [/^(.+) hasn’t logged anything since (.+)$/, function (m) { return "لم يسجّل " + m[1] + " أي شيء منذ " + m[2]; }],
    [/^(.+) hasn’t logged anything recently$/, function (m) { return "لم يسجّل " + m[1] + " أي شيء مؤخرًا"; }],
    [/^(.+) hasn’t confirmed your instruction$/, function (m) { return "لم يؤكد " + m[1] + " تعليماتك"; }],
    [/^(.+) hasn’t confirmed (\d+) instructions$/, function (m) { return "لم يؤكد " + m[1] + " " + m[2] + " تعليمات"; }],
    [/^(\d+) meals?$/, function (m) { return m[1] === "1" ? "وجبة واحدة" : m[1] + " وجبات"; }],
    [/^(\d+) min$/, function (m) { return m[1] + " دقيقة"; }],
    [/^Attendance (.+)$/, function (m) { return "الحضور " + m[1]; }],
    [/^Trained (\d+) min this week$/, function (m) { return "تمرّن " + m[1] + " دقيقة هذا الأسبوع"; }],
    [/^Avg rating (.+)$/, function (m) { return "متوسط التقييم " + m[1]; }],
    [/^(\d+)\/(\d+) done$/, function (m) { return "تم " + m[1] + " من " + m[2]; }],
    [/^by (.+)$/, function (m) { return "بحلول " + m[1]; }],
    [/^From (.+)$/, function (m) { return "من " + (m[1] === "your coach" ? "مدربك" : m[1]); }],
    [/^([\d,]+) kcal$/, function (m) { return m[1] + " سعرة"; }],
    [/^\/ ([\d,]+) kcal$/, function (m) { return "/ " + m[1] + " سعرة"; }],
    [/^\/ ([\d,]+) g$/, function (m) { return "/ " + m[1] + " جم"; }],
    [/^([\d,]+) \/ ([\d,]+) kcal$/, function (m) { return m[1] + " / " + m[2] + " سعرة"; }],
    [/^([\d,]+) \/ ([\d,]+) g$/, function (m) { return m[1] + " / " + m[2] + " جم"; }],
    [/^(\d+) g$/, function (m) { return m[1] + " جم"; }],
    [/^P (\d+)( g)?$/, function (m) { return "بروتين " + m[1] + (m[2] ? " جم" : ""); }],
    [/^C (\d+)( g)?$/, function (m) { return "كارب " + m[1] + (m[2] ? " جم" : ""); }],
    [/^F (\d+)( g)?$/, function (m) { return "دهون " + m[1] + (m[2] ? " جم" : ""); }],
    [/^(\d+) g · (\d+) g$/, function (m) { return m[1] + " جم · " + m[2] + " جم"; }],
    [/^Remove (.+) from the club\? They lose access straight away\. Their past logs stay saved\.$/, function (m) { return "إزالة " + m[1] + " من النادي؟ سيفقد الوصول فورًا وتبقى سجلاته السابقة محفوظة."; }],
    [/^(\d+) in$/, function (m) { return m[1] + " حضر"; }], [/^(\d+) absent$/, function (m) { return m[1] + " غائب"; }], [/^(\d+) excused$/, function (m) { return m[1] + " بعذر"; }],
    [/^(.+?)\. Players who said they can’t make it start as excused\. Ratings are optional \(1–10\), private to each player, and feed their form\.$/, function (m) { return m[1] + ". من قالوا إنهم لن يحضروا يُسجَّلون بعذر. التقييمات اختيارية (1–10)، خاصة بكل لاعب، وتُبنى عليها مستوياتهم."; }],
    [/^Said: (.+)$/, function (m) { return "قال: " + t(m[1]); }],
    [/^Sign in to send feedback, or email (.+)$/, function (m) { return "سجّل الدخول لإرسال رأيك، أو راسلنا على " + m[1]; }],
    [/^Online payment isn’t set up yet\. Email (.+) to subscribe\.$/, function (m) { return "الدفع الإلكتروني غير متاح بعد. راسلنا على " + m[1] + " للاشتراك."; }],
    [/^Ends (.*)\. Subscribe any time to keep everything running after that\.$/, function (m) { return "تنتهي في " + m[1] + ". اشترك في أي وقت ليستمر كل شيء بعدها."; }],
    [/^Paid until (.*)\. Renews automatically each month\.$/, function (m) { return "مدفوع حتى " + m[1] + ". يتجدد تلقائيًا كل شهر."; }],
    [/^(.+) per club, unlimited players and coaches\. Cancel any time\. Club reference: $/, function (m) { return t(m[1]) + " لكل نادٍ، بعدد غير محدود من اللاعبين والمدربين. ألغِ في أي وقت. مرجع النادي: "; }],
    [/^Monthly report · (.+)$/, function (m) { return "التقرير الشهري · " + m[1]; }],
    [/^(\d+) upcoming sessions\. You get a reminder 2 hours before each one\.$/, function (m) { return m[1] + " مواعيد قادمة. ستصلك تذكرة قبل كل موعد بساعتين."; }],
    [/^(\d+) min logged in total$/, function (m) { return m[1] + " دقيقة مسجّلة إجمالًا"; }],
    [/^(\d+) of (\d+) tasks in current plans$/, function (m) { return m[1] + " من " + m[2] + " مهام في الخطط الحالية"; }],
    [/^Now viewing as (.+)$/, function (m) { return "تشاهد الآن كـ " + m[1]; }],
    [/^Squad for (.+?), (Today|Tomorrow|Yesterday)$/, function (m) { return "التشكيلة لـ " + t(m[1]) + "، " + t(m[2]); }],
    [/^Squad for (.+)$/, function (m) { return "التشكيلة لـ " + (m[1] === "the next match" ? "المباراة القادمة" : t(m[1])); }],
    [/^(Morning|Afternoon|Evening), (.+)$/, function (m) { return (m[1] === "Morning" ? "صباح الخير يا " : "مساء الخير يا ") + m[2]; }],
    [/^vs (.+)$/, function (m) { return "ضد " + m[1]; }],
    [/^(\d+) day left$/, function (m) { return "متبقٍ يوم واحد"; }],
    [/^Subscribe$/, function () { return "اشترك"; }],
    [/^(\d+) in · (\d+) absent$/, function (m) { return m[1] + " حضر · " + m[2] + " غائب"; }],
  ];

  function tr(s) {
    if (Object.prototype.hasOwnProperty.call(AR, s)) return AR[s];
    var dotted = s.indexOf(" · ") > 0;
    for (var i = 0; i < PAT.length; i++) { if (dotted && PAT[i][0].source.indexOf("·") < 0) continue; var m = s.match(PAT[i][0]); if (m) return PAT[i][1](m); }
    if (s.indexOf(" · ") > 0) {
      var parts = s.split(" · "), changed = false;
      var out = parts.map(function (p) { var r = tr(p); if (r != null) { changed = true; return r; } return p; });
      if (changed) return out.join(" · ");
    }
    return null;
  }
  function fixText(node) {
    var v = node.nodeValue; if (!v || !/[A-Za-z]/.test(v)) return;
    var p = node.parentNode; if (!p || /^(SCRIPT|STYLE|TEXTAREA|CODE)$/.test(p.nodeName)) return;
    if (p.closest && p.closest("[translate=no],.notranslate")) return;
    // exact match first, so fragments like "Delete " and " · by " keep their spacing
    if (Object.prototype.hasOwnProperty.call(AR, v)) { node.nodeValue = AR[v]; return; }
    var core = v.trim(); if (!core) return;
    var r = tr(core); if (r == null) return;
    node.nodeValue = v.match(/^\s*/)[0] + r + v.match(/\s*$/)[0];
  }
  var ATTRS = ["placeholder", "title", "aria-label", "alt"];
  function fixEl(e) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = e.getAttribute && e.getAttribute(ATTRS[i]);
      if (a && /[A-Za-z]/.test(a)) { var r = tr(a.trim()); if (r != null) e.setAttribute(ATTRS[i], r); }
    }
    if (e.tagName === "OPTION" && e.textContent) { var o = tr(e.textContent.trim()); if (o != null) e.textContent = o; }
  }
  function walk(root) {
    if (root.nodeType === 3) { fixText(root); return; }
    if (root.nodeType !== 1) return;
    if (/^(SCRIPT|STYLE|TEXTAREA)$/.test(root.nodeName)) return;
    fixEl(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    var node;
    while ((node = w.nextNode())) { if (node.nodeType === 3) fixText(node); else fixEl(node); }
  }
  var busy = false;
  var mo = new MutationObserver(function (list) {
    if (busy) return; busy = true;
    try {
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === "childList") m.addedNodes.forEach(walk);
        else if (m.type === "characterData") walk(m.target);
        else if (m.type === "attributes") fixEl(m.target);
      }
      placeButton();
    } finally { busy = false; }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  document.addEventListener("DOMContentLoaded", function () { walk(document.body); var tt = document.querySelector("title"); if (tt) { var r = tr(tt.textContent); if (r) tt.textContent = r; } placeButton(); });
  window.tlT = t;
})();
