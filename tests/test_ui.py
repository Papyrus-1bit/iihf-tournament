from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


def test_home_loads(driver, app_url):
    driver.get(app_url)
    wait = WebDriverWait(driver, 15)
    hero = wait.until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='tournament-hero']"))
    )
    assert hero.is_displayed()


def test_open_new_tournament_modal(driver, app_url):
    driver.get(app_url)
    wait = WebDriverWait(driver, 15)
    button = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "[aria-label='Новый турнир']"))
    )
    button.click()
    modal = wait.until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='tournament-modal']"))
    )
    assert modal.is_displayed()


def test_select_team_updates_summary(driver, app_url):
    driver.get(app_url)
    wait = WebDriverWait(driver, 20)
    summary_name = wait.until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='team-summary-name']"))
    )
    initial_name = summary_name.text
    rating_rows = wait.until(
        EC.presence_of_all_elements_located((By.CSS_SELECTOR, "[data-testid^='rating-row-']"))
    )
    if len(rating_rows) < 2:
        return
    rating_rows[1].click()
    wait.until(
        lambda d: d.find_element(By.CSS_SELECTOR, "[data-testid='team-summary-name']").text
        != initial_name
    )
