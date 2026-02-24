<?php

use App\Http\Controllers\OrderViewController;
use Illuminate\Support\Facades\Route;

Route::get('/', static fn () => response()->json(['status' => 'ok', 'service' => 'read-model-service']));
Route::get('/orders', [OrderViewController::class, 'index']);
Route::get('/orders/{id}', [OrderViewController::class, 'show']);
