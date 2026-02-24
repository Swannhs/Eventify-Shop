<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('processed_events')) {
            Schema::create('processed_events', function (Blueprint $table): void {
                $table->uuid('event_id')->primary();
                $table->timestampTz('processed_at');
            });
        }
    }

    public function down(): void
    {
        // Shared table with other services in this demo setup; do not drop on rollback.
    }
};
