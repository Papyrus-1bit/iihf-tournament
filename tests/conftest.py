import os

import pytest
from selenium import webdriver


@pytest.fixture(scope="session")
def app_url() -> str:
    return os.getenv("APP_URL", "http://localhost:5173")


@pytest.fixture(scope="session")
def driver():
    options = webdriver.ChromeOptions()
    if os.getenv("HEADLESS", "1") == "1":
        options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    driver = webdriver.Chrome(options=options)
    driver.set_window_size(1440, 900)
    yield driver
    driver.quit()
