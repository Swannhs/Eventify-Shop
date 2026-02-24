<?php

use App\Http\Controllers\Internal\PaymentProcessingController;
use Illuminate\Support\Facades\Route;

Route::post('/internal/payments/process-order-placed', [PaymentProcessingController::class, 'processOrderPlaced']);
Route::get('/health', static fn () => response()->json(['status' => 'ok', 'service' => 'payment-service']));
