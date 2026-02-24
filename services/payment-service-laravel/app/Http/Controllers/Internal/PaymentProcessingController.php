<?php

namespace App\Http\Controllers\Internal;

use App\Exceptions\TransientPaymentException;
use App\Http\Controllers\Controller;
use App\Http\Requests\ProcessOrderPlacedRequest;
use App\Services\PaymentProcessingService;
use Illuminate\Http\JsonResponse;

class PaymentProcessingController extends Controller
{
    public function __construct(private readonly PaymentProcessingService $paymentProcessingService)
    {
    }

    public function processOrderPlaced(ProcessOrderPlacedRequest $request): JsonResponse
    {
        try {
            $result = $this->paymentProcessingService->process($request->validated());

            return response()->json($result, 200);
        } catch (TransientPaymentException $exception) {
            return response()->json([
                'status' => 'transient_error',
                'message' => $exception->getMessage(),
            ], 503);
        }
    }
}
