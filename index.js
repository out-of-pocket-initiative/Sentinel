const puppeteer = require("puppeteer");
const fs = require("fs").promises;

const FACEBOOK_URL = "https://www.facebook.com";
const GC_URL = `https://www.facebook.com/messages/t/${process.env.GC_URL}`;

const getDefaultBrowser = async (headless) => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const context = browser.defaultBrowserContext();
  context.overridePermissions(FACEBOOK_URL, []);
  return browser;
};

const getDefaultPage = async (browser) => {
  const page = await browser.newPage();
  await page.setViewport({
    width: 800,
    height: 800,
    deviceScaleFactor: 1,
  });
  await page.setDefaultNavigationTimeout(100000000);
  return page;
};

const isLoggedIn = async (page) => {
  await page.goto(FACEBOOK_URL, {
    waitUntil: "networkidle2",
  });
  await page.waitForSelector("div[role=feed]");
};

const loginWithSession = async (cookies, page) => {
  console.log("Logging into Facebook using cookies");
  await page.setCookie(...cookies);
  await page.goto(FACEBOOK_URL, { waitUntil: "networkidle2" });
  await isLoggedIn(page).catch((error) => {
    console.error("App is not logged into Facebook");
    throw error;
  });
};

const loginWithCredentials = async (username, password, page) => {
  console.log("Logging into Facebook using credentials for", username);
  await page.goto(FACEBOOK_URL, {
    waitUntil: "networkidle2",
  });
  await page.waitForSelector("#email");
  await page.type("#email", username);
  await page.type("#pass", password);

  const cookieBanner = 'div[data-testid="cookie-policy-banner"]';
  if ((await page.$(cookieBanner)) !== null) {
    console.log("Facebook cookie banner found");
    await page.evaluate((selector) => {
      const elements = document.querySelectorAll(selector);
      for (let i = 0; i < elements.length; i += 1) {
        elements[i].parentNode.removeChild(elements[i]);
      }
    }, cookieBanner);
  }

  await page.click("button[name=login]");
  await page.waitForNavigation();

  // For first time manual login with 2FA
  // await page.waitForTimeout(15000);
  // const testCookies = await page.cookies()
  // console.log('test cookies', testCookies)


  await isLoggedIn(page).catch((error) => {
    console.error("App is not logged into Facebook");
    throw error;
  });
};

(async () => {
  const browser = await getDefaultBrowser(true);
  const page = await getDefaultPage(browser);
  const username = process.env.FB_USERNAME;
  const password = process.env.FB_PASSWORD;

  // Load cookies from previous session
  const cookies = await fs
    .readFile("_cookies.json")
    .then((facebookCookies) => JSON.parse(facebookCookies))
    .catch((error) => {
      console.error(`Unable to load Facebook cookies: ${error}`);
      return {};
    });
  await page.goto(FACEBOOK_URL, {
    waitUntil: "networkidle2",
  });
  // Use our cookies to login. If it fails fallback to username and password login.
  if (cookies && Object.keys(cookies).length) {
    await loginWithSession(cookies, page).catch(async (error) => {
      console.error(`Unable to login using session: ${error}`);
      await loginWithCredentials(username, password, page);
    });
  } else {
    await loginWithCredentials(username, password, page);
  }

  // Save our freshest cookies that contain our Facebook session
  await page.cookies().then(async (freshCookies) => {
    await fs.writeFile("_cookies.json", JSON.stringify(freshCookies, null, 2));
  });

  // Redirect to group chat
  await page.goto(GC_URL, {
    waitUntil: "networkidle2",
  });
})();
