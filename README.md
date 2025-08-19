# FishTrade — Deployable MVP

B2B-маркетплейс для торговли рыбой между **производителями** и **розничными сетями**.
Готов к развёртыванию: Node.js + Express API, встраиваемая БД (NeDB), статический фронтенд.

## Быстрый старт (локально)

```bash
node -v  # >= 18
git clone <repo> fishtrade-mvp  # или распакуйте архив
cd fishtrade-mvp
cp .env.example .env           # при необходимости измените ADMIN_TOKEN
npm install
npm start
# откройте http://localhost:8080
```

## Запуск в Docker

```bash
docker build -t fishtrade-mvp .
docker run -p 8080:8080 -e ADMIN_TOKEN=devkey -v $(pwd)/data:/app/data --name fishtrade fishtrade-mvp
# или
docker compose up -d
```

## Роли и безопасность

- Публичные операции (покупатель): просмотр лотов, создание RFQ, оформление демонстрационного заказа.
- Операции производителя требуют API-ключа: передавайте заголовок `x-api-key: <ADMIN_TOKEN>`.
  - В интерфейсе переключите роль на «Производитель», введите ключ (по умолчанию `devkey`) и сохраняйте.

## API (основные)

- `GET /api/products` — список лотов (`q`, `species`, `sort=priceAsc|priceDesc|freshFirst|ratingDesc`).
- `POST /api/lots` — **(prod)** добавить лот.
- `GET /api/rfqs` — список RFQ с вложенными предложениями.
- `POST /api/rfqs` — создать RFQ.
- `POST /api/rfqs/:id/offers` — **(prod)** ответить на RFQ.
- `GET /api/orders` — список заказов.
- `POST /api/orders` — создать заказ.

## Данные и персистентность

Все данные хранятся в `./data/*.db` (NeDB, JSON), том монтируется в Docker. При первом запуске выполняется сидинг лотов.

## Стек

- Backend: Node.js 20, Express, Helmet, NeDB (@seald-io/nedb).
- Frontend: чистый HTML/CSS/JS, шрифт Outfit, палитра Sky/Navy Blue.
- Развёртывание: один контейнер (или `npm start`).

## Лицензия

MVP предназначен для демонстрационных и пилотных запусков.
