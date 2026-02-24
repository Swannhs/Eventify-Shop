<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('shipments_view')) {
            return;
        }

        Schema::create('shipments_view', function (Blueprint $table): void {
            $table->uuid('shipment_id')->primary();
            $table->uuid('order_id')->index();
            $table->string('carrier', 64)->default('DEMO-CARRIER');
            $table->string('status', 32);
            $table->timestampTz('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shipments_view');
    }
};
