<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('orders_view')) {
            return;
        }

        Schema::create('orders_view', function (Blueprint $table): void {
            $table->uuid('order_id')->primary();
            $table->string('status', 32);
            $table->decimal('total', 12, 2)->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orders_view');
    }
};
