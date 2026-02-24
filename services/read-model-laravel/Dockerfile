FROM php:8.3-cli-alpine

WORKDIR /app

RUN apk add --no-cache git curl unzip postgresql-dev \
    && docker-php-ext-install pdo pdo_pgsql

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

COPY composer.json composer.lock ./
RUN COMPOSER_CACHE_DIR=/tmp/composer-cache composer install --no-dev --prefer-dist --no-interaction --no-progress --no-scripts

COPY . .
RUN rm -f bootstrap/cache/*.php

RUN mkdir -p storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 8086

CMD ["sh", "-lc", "php -r '$pdo=new PDO(\"pgsql:host=\".getenv(\"DB_HOST\").\";port=\".getenv(\"DB_PORT\").\";dbname=\".getenv(\"DB_DATABASE\"), getenv(\"DB_USERNAME\"), getenv(\"DB_PASSWORD\")); $schema=getenv(\"DB_SCHEMA\") ?: \"read_model\"; $pdo->exec(\"CREATE SCHEMA IF NOT EXISTS \\\"\".$schema.\"\\\"\");' && php artisan migrate --force && php artisan serve --host=0.0.0.0 --port=${READ_MODEL_SERVICE_PORT:-8086}"]
