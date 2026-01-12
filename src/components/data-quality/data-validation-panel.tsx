/**
 * Data Validation Panel
 * Shows cross-table validation results and data completeness
 */

"use client";

import { useEffect, useState } from "react";
import { validateCrossTableData, type CrossTableValidation } from "@/lib/data-validation/cross-table-validation";
import { calculateDealCompleteness, type DealCompleteness } from "@/lib/data-validation/completeness-scoring";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface DataValidationPanelProps {
  submissionId: string;
  dealId?: number;
  className?: string;
}

export function DataValidationPanel({
  submissionId,
  dealId,
  className,
}: DataValidationPanelProps) {
  const [validation, setValidation] = useState<CrossTableValidation | null>(null);
  const [completeness, setCompleteness] = useState<DealCompleteness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const [validationData, completenessData] = await Promise.all([
          validateCrossTableData(submissionId),
          dealId ? calculateDealCompleteness(dealId) : null,
        ]);

        setValidation(validationData);
        setCompleteness(completenessData);
      } catch (err) {
        console.error("[DataValidationPanel] Error loading data:", err);
        setError("Failed to load validation data");
      } finally {
        setLoading(false);
      }
    }

    if (submissionId) {
      loadData();
    }
  }, [submissionId, dealId]);

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Data Validation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">Validating data...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Data Validation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-destructive">{error}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!validation) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Data Validation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">No validation data available</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getConsistencyColor = () => {
    if (validation.overallConsistency === "Consistent") {
      return "text-green-600 dark:text-green-400";
    }
    if (validation.overallConsistency === "Partial") {
      return "text-yellow-600 dark:text-yellow-400";
    }
    return "text-red-600 dark:text-red-400";
  };

  const getConsistencyIcon = () => {
    if (validation.overallConsistency === "Consistent") {
      return <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />;
    }
    if (validation.overallConsistency === "Partial") {
      return <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />;
    }
    return <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />;
  };

  return (
    <div className={className}>
      {/* Data Consistency */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Data Consistency
            {getConsistencyIcon()}
          </CardTitle>
          <CardDescription>
            Cross-table validation results
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Overall Consistency</span>
            <Badge
              variant={
                validation.overallConsistency === "Consistent"
                  ? "default"
                  : validation.overallConsistency === "Partial"
                    ? "secondary"
                    : "destructive"
              }
              className={getConsistencyColor()}
            >
              {validation.consistencyScore}% - {validation.overallConsistency}
            </Badge>
          </div>

          <Progress value={validation.consistencyScore} className="h-2" />

          {/* Field Validations */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Field Validation</h4>
            {validation.policyNumber && (
              <ValidationFieldItem
                label="Policy Number"
                validation={validation.policyNumber}
              />
            )}
            {validation.carrier && (
              <ValidationFieldItem label="Carrier" validation={validation.carrier} />
            )}
            {validation.premium && (
              <ValidationFieldItem label="Premium" validation={validation.premium} />
            )}
            {validation.agent && (
              <ValidationFieldItem label="Agent" validation={validation.agent} />
            )}
            {validation.customerName && (
              <ValidationFieldItem
                label="Customer Name"
                validation={validation.customerName}
              />
            )}
            {validation.phoneNumber && (
              <ValidationFieldItem
                label="Phone Number"
                validation={validation.phoneNumber}
              />
            )}
          </div>

          {/* Issues */}
          {validation.issues.length > 0 && (
            <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                    Issues Found
                  </div>
                  <ul className="mt-1 space-y-1 text-xs text-yellow-700 dark:text-yellow-400">
                    {validation.issues.map((issue, idx) => (
                      <li key={idx}>• {issue}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Recommendations */}
          {validation.recommendations.length > 0 && (
            <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 p-3">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-blue-800 dark:text-blue-300">
                    Recommendations
                  </div>
                  <ul className="mt-1 space-y-1 text-xs text-blue-700 dark:text-blue-400">
                    {validation.recommendations.map((rec, idx) => (
                      <li key={idx}>• {rec}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Completeness */}
      {completeness && (
        <Card>
          <CardHeader>
            <CardTitle>Data Completeness</CardTitle>
            <CardDescription>Field completeness across all tables</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Overall Completeness</span>
                <Badge variant="outline">{completeness.score.overall}%</Badge>
              </div>
              <Progress value={completeness.score.overall} className="h-2" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Required Fields</span>
                  <Badge variant="outline" className="text-xs">
                    {completeness.score.required}%
                  </Badge>
                </div>
                <Progress value={completeness.score.required} className="h-1.5" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Optional Fields</span>
                  <Badge variant="outline" className="text-xs">
                    {completeness.score.optional}%
                  </Badge>
                </div>
                <Progress value={completeness.score.optional} className="h-1.5" />
              </div>
            </div>

            {/* Breakdown */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Table Breakdown</h4>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-muted-foreground">Monday Deals</div>
                  <div className="font-medium">{completeness.breakdown.mondayDeals}%</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Leads</div>
                  <div className="font-medium">{completeness.breakdown.leads}%</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Deal Flow</div>
                  <div className="font-medium">{completeness.breakdown.dealFlow}%</div>
                </div>
              </div>
            </div>

            {/* Missing Fields */}
            {completeness.score.missingRequired.length > 0 && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 p-3">
                <div className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Missing Required Fields
                </div>
                <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  {completeness.score.missingRequired.slice(0, 5).join(", ")}
                  {completeness.score.missingRequired.length > 5 &&
                    ` +${completeness.score.missingRequired.length - 5} more`}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {completeness.score.recommendations.length > 0 && (
              <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 p-3">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-blue-800 dark:text-blue-300">
                      Recommendations
                    </div>
                    <ul className="mt-1 space-y-1 text-xs text-blue-700 dark:text-blue-400">
                      {completeness.score.recommendations.map((rec, idx) => (
                        <li key={idx}>• {rec}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ValidationFieldItem({
  label,
  validation,
}: {
  label: string;
  validation: { consistent: boolean; value: string | number | null; source: string; issues?: string[] };
}) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-md border p-2">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          {validation.consistent ? (
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          ) : (
            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
          )}
          <span className="text-sm font-medium">{label}</span>
        </div>
        {validation.value && (
          <div className="mt-1 text-xs text-muted-foreground">
            Value: {String(validation.value)}
          </div>
        )}
        <div className="mt-1 text-xs text-muted-foreground">Source: {validation.source}</div>
        {validation.issues && validation.issues.length > 0 && (
          <div className="mt-1 text-xs text-red-600 dark:text-red-400">
            {validation.issues[0]}
          </div>
        )}
      </div>
      <Badge variant={validation.consistent ? "default" : "destructive"} className="text-xs">
        {validation.consistent ? "Consistent" : "Inconsistent"}
      </Badge>
    </div>
  );
}


