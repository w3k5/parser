import * as fs from 'fs';
import ora from 'ora';
import puppeteer, { Browser } from 'puppeteer';
import dayjs from 'dayjs';
import prompt from 'prompt';
import { DataInterface } from './interfaces';
import { ensureDir } from './utils/ensure.util';

const spinner = ora('Parsing in progress');
prompt.start();

const configPrompt = async (): Promise<{ headless: boolean }> => {
  const { headless } = await prompt.get([
    {
      name: 'headless',
      type: 'boolean',
      required: true,
      description: 'Would you like to hide browser?',
    },
  ]);
  return { headless: JSON.parse(headless as string) };
};

const pagePrompt = async (): Promise<{ link: string }> => {
  const { link } = await prompt.get([
    {
      name: 'link',
      type: 'string',
      required: true,
      description: 'Which of page would you like to parse?',
    },
  ]);
  return { link: link as string };
};

const createBrowser = async (): Promise<Browser> => {
  const { headless } = await configPrompt();
  const config = {
    headless,
    defaultViewport: null,
    devtools: false,
    slowMo: 200,
  };
  const browser = await puppeteer.launch(config);
  return browser;
};

(async (): Promise<void> => {
  const { link: parseLink } = await pagePrompt();
  const fullResult: DataInterface[] = [];
  let isParserWorking = true;
  let counter = 1;

  const browser = await createBrowser();

  try {
    const page = await browser.newPage();

    while (isParserWorking) {
      spinner.text = `Page ${counter} is being parsed`;
      spinner.start();
      const parseLinkWithParams = counter === 1 ? parseLink : `${parseLink}/?p=${counter}`;
      await page.goto(parseLinkWithParams, {
        waitUntil: 'networkidle0',
      });
      const pageData = await page.evaluate(() => {
        const data: DataInterface[] = [];
        try {
          const products = document.querySelectorAll('.catalog-product');
          products.forEach((product) => {
            const priceElement = product.querySelector('.product-buy__price');
            const price = priceElement ? priceElement.innerHTML : 'NO-PRICE';

            const isSalePriceElement = priceElement?.querySelector('.product-buy__prev');
            const isSale = !!isSalePriceElement;

            const linkElement = product.querySelector('.catalog-product__name');
            const link = linkElement && linkElement.getAttribute('href') ? `https://www.dns-shop.ru${linkElement.getAttribute('href') as string}` : 'NO-LINK';

            const title = linkElement?.querySelector('span')?.innerHTML as string;
            const productInfo: DataInterface = {
              title,
              price: isSale ? +(isSalePriceElement?.innerHTML as string).replace(' ', '').match(/\d+/)![0] : +price.replace(' ', '').match(/\d+/)![0],
              link,
              isSale,
            };
            data.push(productInfo);
          });
        } catch (e) {
          spinner.fail(`Something went wrong ${e}`);
          throw new Error('Something went wrong');
        }
        return data;
      }, {

      });
      if (!pageData.length) {
        spinner.succeed('Data was parsed');
        break;
      }
      fullResult.push(...pageData);
      counter++;
    }

    const resultDir = 'parse-results';

    ensureDir(resultDir);

    const date = dayjs().format('DD-MMMM-YYYY-HH:mm');

    await browser.close();

    fs.writeFile(`${resultDir}/dns-parse-${date}.json`, JSON.stringify(fullResult), (err) => {
      spinner.text = 'Write file';
      spinner.start();
      if (err) {
        spinner.fail(`Something went wrong ${err.message}`);
      }
      spinner.succeed('File has been written successfully');
    });
  } catch (e) {
    spinner.fail(`Something went wrong ${e}`);
    isParserWorking = false;
    await browser.close();
  }
})();
