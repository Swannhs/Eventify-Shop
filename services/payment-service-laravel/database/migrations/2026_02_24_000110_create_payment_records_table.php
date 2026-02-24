<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_records', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->uuid('source_event_id')->unique();
            $table->uuid('order_id');
            $table->uuid('correlation_id');
            $table->string('status', 32);
            $table->jsonb('input_payload');
            $table->timestampTz('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_records');
    }
};
