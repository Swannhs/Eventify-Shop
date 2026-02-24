<?php

namespace App\Http\Controllers\Internal;

use App\Http\Controllers\Controller;
use App\Http\Requests\ApplyProjectionEventRequest;
use App\Services\ProjectionService;
use Illuminate\Http\JsonResponse;

class ProjectionController extends Controller
{
    public function __construct(private readonly ProjectionService $projectionService)
    {
    }

    public function apply(ApplyProjectionEventRequest $request): JsonResponse
    {
        $result = $this->projectionService->apply($request->validated());

        return response()->json($result, 200);
    }
}
