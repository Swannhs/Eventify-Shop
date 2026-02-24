<?php

use App\Http\Controllers\Internal\ProjectionController;
use App\Http\Controllers\OrderViewController;
use Illuminate\Support\Facades\Route;

Route::post('/internal/projections/apply', [ProjectionController::class, 'apply']);
Route::get('/orders', [OrderViewController::class, 'index']);
Route::get('/orders/{id}', [OrderViewController::class, 'show']);
Route::get('/health', static fn () => response()->json(['status' => 'ok', 'service' => 'read-model-service']));
