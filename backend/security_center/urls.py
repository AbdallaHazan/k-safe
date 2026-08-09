from django.urls import path

from .views import DashboardStatsView, SecurityLogListView, SecurityScoreView

urlpatterns = [
    path("security-score", SecurityScoreView.as_view(), name="security-score"),
    path("security-logs", SecurityLogListView.as_view(), name="security-logs"),
    path("dashboard", DashboardStatsView.as_view(), name="dashboard"),
]
