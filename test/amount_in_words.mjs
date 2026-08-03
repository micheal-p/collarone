// The words on an invoice must say the same thing as the figures. Approvers and
// banks read one against the other, so a wrong word is a disputed invoice.
//
// Run:  node test/amount_in_words.mjs
import { amountInWords } from '../client/src/lib/amountInWords.js';

const CASES = [
  [0, 'Zero naira only'],
  [1, 'One naira only'],
  [15, 'Fifteen naira only'],
  [100, 'One hundred naira only'],
  [105, 'One hundred and five naira only'],
  [1000, 'One thousand naira only'],
  // "and" before a final chunk under 100, but a comma before a hundreds chunk
  [1050, 'One thousand and fifty naira only'],
  [1234.5, 'One thousand, two hundred and thirty-four naira, fifty kobo only'],
  [487500, 'Four hundred and eighty-seven thousand, five hundred naira only'],
  [1000000, 'One million naira only'],
  [2500000.75, 'Two million, five hundred thousand naira, seventy-five kobo only'],
  [999999999, 'Nine hundred and ninety-nine million, nine hundred and ninety-nine thousand, nine hundred and ninety-nine naira only'],
  [0.99, 'Zero naira, ninety-nine kobo only'],
  // kobo rounds rather than truncates, or ₦0.999 would print as zero kobo
  [12.005, 'Twelve naira, one kobo only'],
  [-500, 'Minus five hundred naira only'],
];

let failures = 0;
for (const [input, want] of CASES) {
  const got = amountInWords(input);
  if (got !== want) {
    failures++;
    console.log(`✗ ${input}\n    want: ${want}\n    got:  ${got}`);
  }
}

if (failures) {
  console.error(`\nFAILED, ${failures} of ${CASES.length}`);
  process.exit(1);
}
console.log(`Amount in words correct for all ${CASES.length} cases. ALL PASSED`);
