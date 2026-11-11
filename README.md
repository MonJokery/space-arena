### Sequential await проти concurrent Promise.all

Для чесного порівняння були проведені виміри вживу при запущеній грі:

Код використаний для порівняння:
```js
const urls = ['/assets/ship-sheet.png','/assets/bullet-sheet.png','/assets/asteroid-sheet.png',
  '/assets/fired.wav','/assets/hit.wav','/assets/exploded.wav','/api/rooms'];
const read = async (url) => { const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(String(response.status)); return response.arrayBuffer(); };
let t = performance.now();
for (const url of urls) await read(url);
console.log('Sequential:', (performance.now()-t).toFixed(2), 'ms');
t = performance.now();
await Promise.all(urls.map(read));
console.log('Concurrent:', (performance.now()-t).toFixed(2), 'ms');
```
Результати:
Метод - Час, мс  

Sequential `await` - 32.20 ms 
Concurrent `Promise.all` - 13.50 ms 

Пояснення: послідовний варіант чекає на завершення кожного запиту перед наступним; `Promise.all` ініціює запити одночасно, тож загальний час часто ближчий до найдовшого запиту. На локальному сервері різниця може бути невеликою; результати залежать від мережі та кешу.

## П'ять задач пов'язаних з порядком

1. `await` і `Promise.then`:

```js
console.log('A');
Promise.resolve().then(() => console.log('C'));
(async () => { console.log('B'); await 0; console.log('D'); })();
console.log('E');
// A B E C D
```

Чому: синхронні рядки раніше; `then` і продовження після `await` — мікрозадачі у порядку постановки.

**2. `setTimeout` всередині `.then`:**

```js
console.log('1');
Promise.resolve().then(() => { console.log('3'); setTimeout(() => console.log('5'), 0); });
queueMicrotask(() => console.log('4'));
console.log('2');
// 1 2 3 4 5
```

Чому: таймер ставиться під час мікрозадачі, але виконається окремою задачею після спорожнення microtask-черги.

3. Два `await` і таймер:

```js
setTimeout(() => console.log('T'), 0);
(async () => { console.log('X'); await Promise.resolve(); console.log('Y'); await 0; console.log('Z'); })();
console.log('W');
// X W Y Z T
```

Чому: кожний `await` віддає керування мікрозадачам, а таймер — наступна task.

4. `requestAnimationFrame` з мікрозадачею і таймером:

```js
requestAnimationFrame(() => {
  console.log('RAF');
  Promise.resolve().then(() => console.log('MICRO'));
  setTimeout(() => console.log('TIMER'), 0);
});
// RAF MICRO TIMER
```

Чому: rAF callback викликається перед відображенням кадру; мікрозадача, додана ним, виконується до таймера з наступного task.

5. Ланцюжок і обробка відхилення:

```js
Promise.resolve()
  .then(() => { console.log('P'); throw new Error('bad'); })
  .catch(() => console.log('C'))
  .finally(() => console.log('F'));
console.log('S');
// S P C F
```

Чому: відхилений Promise переходить до `.catch`, а `.finally` виконується після завершення ланцюжка.

## Галерея збоїв (повторювані сценарії)

Для кожного сценарію зробіть скріншот loading-екрана та повідомлення про помилку. Вибір режиму — лише **навмисна перевірка**, а не частина звичайної гри.

Сценарій - Як відтворити - Очікувана поведінка 
404 спрайта - `Тест помилки → 404 спрайта`, натиснути «Завантажити ресурси» - `HTTP 404`, без повтору 4xx; є Retry 

Таймаут - `Тест помилки → Таймаут`, натиснути «Завантажити ресурси», після помилки `Retry` - Сигнал `AbortSignal.timeout` перериває запит; є Retry 

Abort посеред завантаження - `Тест помилки → Повільне завантаження`, натиснути «Завантажити ресурси», під час очікування — `Abort завантаження`, потім Retry - Зупинення без падіння, повідомлення «Скасовано»

Битий JSON - `Тест помилки → Битий JSON`, потім Retry - Повідомлення `Некоректний JSON`, є Retry 

Повернення до гри: у списку вибрати «Без помилки» і натиснути Retry. Для повторення сценарію після успішного loading перезавантажити сторінку та вибрати потрібний режим перед стартом; варіант зі сповільненням дозволяє точно встигнути натиснути Abort.