from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


def _open_modal(driver):
    wait = WebDriverWait(driver, 20)
    button = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, ".hero-create-button"))
    )
    button.click()
    modal = wait.until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='tournament-modal']"))
    )
    return modal


def _create_tournament(driver):
    wait = WebDriverWait(driver, 20)
    _open_modal(driver)
    create_button = wait.until(
        EC.element_to_be_clickable(
            (
                By.XPATH,
                "//div[@data-testid='tournament-modal']//button[contains(., 'Создать турнир')]",
            )
        )
    )
    create_button.click()
    wait.until(
        EC.invisibility_of_element_located((By.CSS_SELECTOR, "[data-testid='tournament-modal']"))
    )
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".calendar-strip")))


def test_home_loads(driver, app_url):
    driver.get(app_url)
    wait = WebDriverWait(driver, 15)
    hero = wait.until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='tournament-hero']"))
    )
    assert hero.is_displayed()


def test_create_tournament_flow(driver, app_url):
    driver.get(app_url)
    _create_tournament(driver)
    assert driver.find_element(By.CSS_SELECTOR, ".calendar-strip").is_displayed()


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


def test_save_and_load_tournament_closes_modal(driver, app_url):
    driver.get(app_url)
    wait = WebDriverWait(driver, 25)
    _create_tournament(driver)

    save_button = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "[aria-label='Сохранить']"))
    )
    save_button.click()

    _open_modal(driver)
    load_buttons = wait.until(
        EC.presence_of_all_elements_located((By.CSS_SELECTOR, "[aria-label='Загрузить']"))
    )
    load_buttons[0].click()
    wait.until(
        EC.invisibility_of_element_located((By.CSS_SELECTOR, "[data-testid='tournament-modal']"))
    )
    wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".calendar-strip")))


def test_rating_table_shows_delta(driver, app_url):
    driver.get(app_url)
    wait = WebDriverWait(driver, 20)
    rating_rows = wait.until(
        EC.presence_of_all_elements_located((By.CSS_SELECTOR, "[data-testid^='rating-row-']"))
    )
    if len(rating_rows) == 0:
        return
    rating_text = rating_rows[0].text
    assert "—" in rating_text or "+" in rating_text or "-" in rating_text


def test_simulate_day_updates_matches(driver, app_url):
    driver.get(app_url)
    wait = WebDriverWait(driver, 25)
    _create_tournament(driver)

    simulate_day = wait.until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, "[aria-label='Симулировать день']"))
    )
    simulate_day.click()

    wait.until(
        lambda d: any(
            marker.text.strip() not in ("", "000")
            for marker in d.find_elements(By.CSS_SELECTOR, ".match-card-marker")
        )
    )
