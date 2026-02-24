<?php

namespace App\Http\Controllers;

use App\Models\OrderView;
use App\Models\ShipmentView;
use Illuminate\Http\JsonResponse;

class OrderViewController extends Controller
{
    public function index(): JsonResponse
    {
        $orders = OrderView::query()->orderByDesc('created_at')->get();

        return response()->json(['data' => $orders]);
    }

    public function show(string $id): JsonResponse
    {
        $order = OrderView::query()->where('order_id', $id)->first();

        if ($order === null) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        $shipments = ShipmentView::query()
            ->where('order_id', $id)
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'data' => [
                'order' => $order,
                'shipments' => $shipments,
            ],
        ]);
    }
}
